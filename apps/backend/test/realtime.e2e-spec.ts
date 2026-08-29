import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { createTestHarness, type TestHarness } from './fixtures/auth-test-harness';
import { STUDY_IN_SCOPE_OLDEST, STUDY_OUT_OF_SCOPE } from './fixtures/study-fixtures';

/**
 * Realtime over a real Socket.IO connection (TASK_QUEUE BACKEND-045).
 *
 * These run against a listening server rather than a mocked gateway, because
 * the things worth testing here — whether an unauthenticated socket gets in,
 * and whether one hospital's events reach another hospital's user — are
 * properties of the handshake and the rooms, not of the emit call.
 */
describe('Realtime (e2e)', () => {
  let harness: TestHarness;
  const tokens: Record<string, string> = {};
  const sockets: Socket[] = [];
  const STUDY = STUDY_IN_SCOPE_OLDEST.id;

  beforeEach(async () => {
    harness = await createTestHarness({
      listen: true,
      withRedis: true,
      studies: [
        { ...STUDY_IN_SCOPE_OLDEST, status: 'UNREAD' },
        { ...STUDY_OUT_OF_SCOPE, status: 'UNREAD' },
      ],
      hospitalAccess: [
        { userId: 'u-doctor', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
        { userId: 'u-doctor-b', hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId },
        // Deliberately granted only the OTHER hospital.
        { userId: 'u-operation', hospitalId: STUDY_OUT_OF_SCOPE.hospitalId },
      ],
    });

    for (const [key, email] of [
      ['doctor', 'doctor@test.local'],
      ['doctorB', 'doctor.b@test.local'],
      ['outsider', 'operation@test.local'],
    ] as const) {
      tokens[key] = await harness.accessTokenFor(email);
    }
  });

  afterEach(async () => {
    // Wait for each socket to actually be gone before closing the server: a
    // half-closed websocket keeps the HTTP server's handle alive, and Jest
    // then cannot exit.
    await Promise.all(
      sockets.splice(0).map(
        (socket) =>
          new Promise<void>((resolve) => {
            if (!socket.connected) {
              socket.close();
              resolve();
              return;
            }
            socket.on('disconnect', () => resolve());
            socket.disconnect();
            setTimeout(resolve, 500);
          }),
      ),
    );
    await harness.close();
  });

  const connect = (token?: string): Socket => {
    const socket = io(`http://127.0.0.1:${harness.port}/realtime`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      ...(token ? { auth: { token } } : {}),
    });
    sockets.push(socket);
    return socket;
  };

  /** Resolves on connect, or rejects with whatever the server refused with. */
  const connected = (socket: Socket): Promise<void> =>
    new Promise((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', (error: Error) => reject(error));
      setTimeout(() => reject(new Error('TIMEOUT')), 4000);
    });

  /** Next event of a given type, or null if none arrives within the window. */
  const nextEvent = <T = Record<string, unknown>>(
    socket: Socket,
    type: string,
    timeoutMs = 3000,
  ): Promise<T | null> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      socket.once(type, (event: T) => {
        clearTimeout(timer);
        resolve(event);
      });
    });

  const post = (path: string, role: string, body?: object) =>
    request(harness.app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${tokens[role]}`)
      .send(body ?? {});

  describe('authentication', () => {
    it('refuses a socket with no token', async () => {
      await expect(connected(connect())).rejects.toThrow('SOCKET_UNAUTHORIZED');
    });

    it('refuses a socket with a garbage token', async () => {
      await expect(connected(connect('not-a-jwt'))).rejects.toThrow('SOCKET_UNAUTHORIZED');
    });

    it('refuses a refresh token where an access token is required', async () => {
      const login = await request(harness.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'doctor@test.local', password: 'Test1234!' });
      const refreshCookie = (login.headers['set-cookie'] as unknown as string[])?.[0] ?? '';
      const refreshToken = refreshCookie.split('=')[1]?.split(';')[0] ?? 'x';

      await expect(connected(connect(refreshToken))).rejects.toThrow('SOCKET_UNAUTHORIZED');
    });

    it('accepts a valid access token', async () => {
      await expect(connected(connect(tokens.doctor))).resolves.toBeUndefined();
    });

    it('refuses the token of a deactivated account', async () => {
      // Resolved from the database on every connect, so a disabled user cannot
      // hold a socket open with a token issued before they were disabled.
      const user = harness.users.find((row) => row.email === 'doctor@test.local');
      if (user) user.status = 'INACTIVE';

      await expect(connected(connect(tokens.doctor))).rejects.toThrow('SOCKET_UNAUTHORIZED');
    });
  });

  describe('study room authorization', () => {
    it('lets an authorized user join', async () => {
      const socket = connect(tokens.doctor);
      await connected(socket);

      const ack = await socket.emitWithAck('study.join', { studyId: STUDY });

      expect(ack).toEqual({ ok: true });
    });

    it('refuses a study in a hospital the user cannot see', async () => {
      const socket = connect(tokens.doctor);
      await connected(socket);

      const ack = await socket.emitWithAck('study.join', { studyId: STUDY_OUT_OF_SCOPE.id });

      expect(ack).toMatchObject({ ok: false, code: 'STUDY_ROOM_ACCESS_DENIED' });
    });

    it('gives the same answer for a study that does not exist', async () => {
      const socket = connect(tokens.doctor);
      await connected(socket);

      // Knowing a UUID is not access, and the answer must not reveal which ids
      // exist (docs/REALTIME_EVENTS.md section 16).
      const ack = await socket.emitWithAck('study.join', {
        studyId: '99999999-9999-4999-8999-999999999999',
      });

      expect(ack).toMatchObject({ ok: false, code: 'STUDY_ROOM_ACCESS_DENIED' });
    });

    it('refuses a join with no studyId', async () => {
      const socket = connect(tokens.doctor);
      await connected(socket);

      const ack = await socket.emitWithAck('study.join', {});

      expect(ack).toMatchObject({ ok: false });
    });

    it('acknowledges a leave', async () => {
      const socket = connect(tokens.doctor);
      await connected(socket);
      await socket.emitWithAck('study.join', { studyId: STUDY });

      expect(await socket.emitWithAck('study.leave', { studyId: STUDY })).toEqual({ ok: true });
    });
  });

  describe('event delivery', () => {
    it('delivers a status change to a user in the hospital', async () => {
      const socket = connect(tokens.doctor);
      await connected(socket);

      const received = nextEvent<{ studyId: string; payload: Record<string, unknown> }>(
        socket,
        'study.status.changed',
      );
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctor').expect(200);

      const event = await received;
      expect(event).toMatchObject({
        studyId: STUDY,
        hospitalId: STUDY_IN_SCOPE_OLDEST.hospitalId,
        payload: { fromStatus: 'UNREAD', toStatus: 'READING' },
      });
      expect((event as unknown as { eventId: string }).eventId).toEqual(expect.any(String));
    });

    it('delivers the lock so other users see who holds the study', async () => {
      const socket = connect(tokens.doctorB);
      await connected(socket);

      const received = nextEvent<{ payload: Record<string, unknown> }>(socket, 'study.locked');
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctor').expect(200);

      expect(await received).toMatchObject({
        payload: { ownerUserId: 'u-doctor', ownerRole: 'DOCTOR', lockType: 'INTERNAL' },
      });
    });

    it('delivers the release, so a waiting user knows the study is free', async () => {
      const socket = connect(tokens.doctorB);
      await connected(socket);
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctor').expect(200);

      const received = nextEvent<{ payload: Record<string, unknown> }>(socket, 'study.unlocked');
      await post(`/api/v1/studies/${STUDY}/lock/release`, 'doctor').expect(200);

      expect(await received).toMatchObject({
        payload: { previousOwnerUserId: 'u-doctor', reason: 'USER_RELEASED' },
      });
    });

    it('reports a force release as an unlock with a reason', async () => {
      const socket = connect(tokens.doctorB);
      await connected(socket);
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctor').expect(200);

      const received = nextEvent<{ payload: Record<string, unknown> }>(socket, 'study.unlocked');
      // Operation is scoped to the other hospital, so a Manager does the force
      // release here; a force release is not its own event type (section 27).
      const manager = await harness.accessTokenFor('manager@test.local');
      await request(harness.app.getHttpServer())
        .post(`/api/v1/studies/${STUDY}/lock/force-release`)
        .set('Authorization', `Bearer ${manager}`)
        .send({ reason: 'doktor ulasilamiyor' })
        .expect(200);

      expect(await received).toMatchObject({ payload: { reason: 'FORCE_RELEASED' } });
    });
  });

  describe('cross-hospital isolation', () => {
    it('does not deliver another hospital events', async () => {
      // The single most important realtime security property (section 82).
      const outsider = connect(tokens.outsider);
      await connected(outsider);

      const received = nextEvent(outsider, 'study.status.changed', 1500);
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctor').expect(200);

      expect(await received).toBeNull();
    });

    it('does not deliver a lock event across hospitals either', async () => {
      const outsider = connect(tokens.outsider);
      await connected(outsider);

      const received = nextEvent(outsider, 'study.locked', 1500);
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctor').expect(200);

      expect(await received).toBeNull();
    });
  });

  describe('reconnect', () => {
    it('serves a fresh connection the same way as the first', async () => {
      const first = connect(tokens.doctor);
      await connected(first);
      first.disconnect();

      // Rooms are rebuilt from the database on every connect, so a reconnect
      // needs no server-side session to survive (section 103).
      const second = connect(tokens.doctor);
      await connected(second);

      expect(await second.emitWithAck('study.join', { studyId: STUDY })).toEqual({ ok: true });
    });

    it('delivers events to a reconnected socket', async () => {
      const first = connect(tokens.doctor);
      await connected(first);
      first.disconnect();

      const second = connect(tokens.doctor);
      await connected(second);

      const received = nextEvent(second, 'study.status.changed');
      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctor').expect(200);

      expect(await received).not.toBeNull();
    });

    it('sends one copy to a client in both the hospital and the study room', async () => {
      const socket = connect(tokens.doctor);
      await connected(socket);
      await socket.emitWithAck('study.join', { studyId: STUDY });

      const seen: string[] = [];
      socket.on('study.status.changed', (event: { eventId: string }) => seen.push(event.eventId));

      await post(`/api/v1/studies/${STUDY}/start-reading`, 'doctor').expect(200);
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Overlapping rooms must not turn into duplicate deliveries.
      expect(seen).toHaveLength(1);
    });
  });
});
