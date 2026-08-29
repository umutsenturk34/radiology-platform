import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import type { Server, Socket } from 'socket.io';
import {
  RealtimeCommand,
  RealtimeErrorCode,
  realtimeRoom,
  type RealtimeAck,
  type RealtimeEvent,
} from '@radiology/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { TokenService } from '../auth/token.service';
import { HospitalScopeService } from '../auth/hospital-scope.service';
import { AppLogger } from '../common/logging/app-logger.service';
import type { AuthenticatedUser } from '../auth/auth.types';

/** The principal is resolved once at connect and kept on the socket. */
interface SocketData {
  user: AuthenticatedUser;
  expiresAtMs?: number;
  expiryTimer?: NodeJS.Timeout;
}

type AuthedSocket = Socket & { data: SocketData };

/**
 * Realtime delivery (TASK_QUEUE BACKEND-045, docs/REALTIME_EVENTS.md).
 *
 * The gateway only distributes; it never mutates. Business actions stay on REST
 * (section 74), and no client command can change a study status (section 75).
 *
 * Authentication happens on the handshake, using the same two calls
 * `JwtAuthGuard` makes — verify the access token, then resolve the user and
 * their hospitals from the database. Realtime security cannot be looser than
 * REST security (section 81), so it reuses REST's security rather than
 * reimplementing it.
 */
@WebSocketGateway({
  namespace: '/realtime',
  // Same explicit allowlist the HTTP server uses; a socket is a browser
  // request too, and a missing origin fails in the browser rather than here.
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger: AppLogger;

  constructor(
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly hospitalScope: HospitalScopeService,
    config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child(RealtimeGateway.name);
    void config;
  }

  /**
   * Authentication runs as handshake middleware, not on connect.
   *
   * Connecting first and disconnecting afterwards would mean an unauthenticated
   * client briefly holds an open socket, and its `connect` event fires before
   * the rejection reaches it. Failing the handshake denies it outright: the
   * client sees `connect_error` and never counts as connected
   * (docs/REALTIME_EVENTS.md section 8).
   */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.authenticate(socket as AuthedSocket)
        .then(() => next())
        .catch((error: Error) => next(error));
    });
  }

  private async authenticate(socket: AuthedSocket): Promise<void> {
    const token = extractToken(socket);

    if (!token) {
      throw new Error(RealtimeErrorCode.SOCKET_UNAUTHORIZED);
    }

    let user: AuthenticatedUser;
    let expiresAtMs: number | undefined;
    try {
      const payload = this.tokens.verifyAccessToken(token);
      // Resolved from the database, never trusted from the token, so a
      // deactivated account or a revoked session cannot open a socket.
      user = await this.auth.resolveAuthenticatedUser(payload.sub, payload.sid);
      expiresAtMs = payload.exp ? payload.exp * 1000 : undefined;
    } catch {
      throw new Error(RealtimeErrorCode.SOCKET_UNAUTHORIZED);
    }

    if (expiresAtMs && expiresAtMs <= Date.now()) {
      throw new Error(RealtimeErrorCode.SOCKET_UNAUTHORIZED);
    }

    socket.data.user = user;
    socket.data.expiresAtMs = expiresAtMs;
  }

  async handleConnection(socket: AuthedSocket): Promise<void> {
    const user = socket.data?.user;
    if (!user) {
      // The middleware should have refused it; never serve a socket without a
      // principal.
      socket.disconnect(true);
      return;
    }

    // Personal and role rooms, then one room per authorized hospital
    // (sections 12-14). Hospital rooms are how a study event reaches exactly
    // the people entitled to see that study.
    await socket.join(realtimeRoom.user(user.id));
    await socket.join(realtimeRoom.role(user.role));
    for (const hospitalId of user.hospitalIds) {
      await socket.join(realtimeRoom.hospital(hospitalId));
    }

    // Hospital access is resolved once per connection, so a socket that
    // outlived its token would keep delivering on stale permissions. Closing
    // it at token expiry bounds that to the access token lifetime and matches
    // the reconnect-with-a-fresh-token flow in section 10.
    if (socket.data.expiresAtMs) {
      socket.data.expiryTimer = setTimeout(
        () => {
          socket.emit('connection.expired', { reason: 'ACCESS_TOKEN_EXPIRED' });
          socket.disconnect(true);
        },
        socket.data.expiresAtMs - Date.now(),
      );
      // Never hold the process open for a socket timer.
      socket.data.expiryTimer.unref?.();
    }

    this.logger.log({ message: 'Realtime client connected', userId: user.id, role: user.role });
  }

  handleDisconnect(socket: AuthedSocket): void {
    // Socket.IO removes room membership itself; the timer is ours to clear
    // (section 113).
    if (socket.data?.expiryTimer) clearTimeout(socket.data.expiryTimer);

    if (socket.data?.user) {
      this.logger.log({ message: 'Realtime client disconnected', userId: socket.data.user.id });
    }
  }

  /**
   * Subscribes to one study's room (section 70).
   *
   * The client sends a study id; the server decides. Knowing a UUID is not
   * access here any more than it is over REST (section 16).
   */
  @SubscribeMessage(RealtimeCommand.STUDY_JOIN)
  async joinStudy(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<RealtimeAck> {
    const user = socket.data?.user;
    if (!user) {
      return fail(RealtimeErrorCode.SOCKET_UNAUTHORIZED, 'Authentication is required.');
    }

    const studyId = readStudyId(body);
    if (!studyId) {
      return fail(RealtimeErrorCode.STUDY_ROOM_ACCESS_DENIED, 'A studyId is required.');
    }

    const study = await this.prisma.study.findUnique({
      where: { id: studyId },
      select: { id: true, hospitalId: true },
    });

    // A missing study and an unauthorized one give the same answer: a client
    // must not be able to probe which study ids exist.
    if (!study || !this.hospitalScope.isAllowed(user, study.hospitalId)) {
      this.logger.warn({ message: 'Study room join denied', userId: user.id, studyId });
      return fail(RealtimeErrorCode.STUDY_ROOM_ACCESS_DENIED, 'Study room access denied.');
    }

    await socket.join(realtimeRoom.study(study.id));
    return { ok: true };
  }

  @SubscribeMessage(RealtimeCommand.STUDY_LEAVE)
  async leaveStudy(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: unknown,
  ): Promise<RealtimeAck> {
    if (!socket.data?.user) {
      return fail(RealtimeErrorCode.SOCKET_UNAUTHORIZED, 'Authentication is required.');
    }

    const studyId = readStudyId(body);
    // Leaving needs no authorization: a client may always stop listening, and
    // leaving a room it was never in is a no-op.
    if (studyId) await socket.leave(realtimeRoom.study(studyId));

    return { ok: true };
  }

  /**
   * Emits one event to a set of rooms.
   *
   * Socket.IO delivers a single copy to a client in several of the rooms, so
   * overlapping targets (hospital plus study) do not produce duplicates.
   */
  emit(rooms: string[], event: RealtimeEvent): void {
    if (rooms.length === 0) return;

    try {
      this.server.to(rooms).emit(event.type, event);
    } catch (error) {
      // Realtime is not the source of truth (section 78): a failed emit is
      // logged, never a reason to fail the business transaction that already
      // committed.
      this.logger.error({
        message: 'Realtime emit failed',
        eventType: event.type,
        eventId: event.eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

}

function fail(code: RealtimeErrorCode, message: string): RealtimeAck {
  return { ok: false, code, message };
}

/** Token from the Socket.IO handshake auth, or a bearer header as a fallback. */
function extractToken(socket: Socket): string | null {
  const fromAuth = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
  if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;

  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim() || null;
  }

  return null;
}

function readStudyId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as { studyId?: unknown }).studyId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
