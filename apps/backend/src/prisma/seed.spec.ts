import { resolveSeedPassword, seedDatabase, seedConstants, shouldResetPasswords } from './seed';

/**
 * In-memory stand-in for the four Prisma delegates the seed touches. It models
 * the real unique constraints so idempotency is exercised the same way the
 * database enforces it, without needing a test database.
 */
type Row = Record<string, unknown>;

interface UpsertArgs<TWhere> {
  where: TWhere;
  update: Row;
  create: Row;
}

interface SlaPolicyRow {
  id: string;
  category: string;
  durationMinutes: number;
  warningBeforeMinutes: number;
  active: boolean;
}

function createFakePrisma() {
  const hospitals: Array<Row & { id: string; code: string }> = [];
  const users: Array<Row & { id: string; email: string }> = [];
  const access: Array<{ id: string; userId: string; hospitalId: string }> = [];
  const slaPolicies: SlaPolicyRow[] = [];

  let sequence = 0;
  const nextId = (prefix: string): string => `${prefix}-${++sequence}`;

  const prisma = {
    hospital: {
      upsert: ({ where, update, create }: UpsertArgs<{ code: string }>) => {
        const existing = hospitals.find((h) => h.code === where.code);
        if (existing) {
          Object.assign(existing, update);
          return Promise.resolve(existing);
        }
        const created = { id: nextId('hospital'), ...create } as Row & {
          id: string;
          code: string;
        };
        hospitals.push(created);
        return Promise.resolve(created);
      },
    },
    user: {
      upsert: ({ where, update, create }: UpsertArgs<{ email: string }>) => {
        const existing = users.find((u) => u.email === where.email);
        if (existing) {
          Object.assign(existing, update);
          return Promise.resolve(existing);
        }
        const created = { id: nextId('user'), ...create } as Row & { id: string; email: string };
        users.push(created);
        return Promise.resolve(created);
      },
    },
    userHospitalAccess: {
      upsert: ({
        where,
        create,
      }: UpsertArgs<{ userId_hospitalId: { userId: string; hospitalId: string } }>) => {
        const key = where.userId_hospitalId;
        const existing = access.find(
          (a) => a.userId === key.userId && a.hospitalId === key.hospitalId,
        );
        if (existing) return Promise.resolve(existing);
        const created = { id: nextId('access'), ...create } as {
          id: string;
          userId: string;
          hospitalId: string;
        };
        access.push(created);
        return Promise.resolve(created);
      },
    },
    slaPolicy: {
      findFirst: ({ where }: { where: { category: string; active: boolean } }) =>
        Promise.resolve(
          slaPolicies.find((p) => p.category === where.category && p.active === where.active) ??
            null,
        ),
      create: ({ data }: { data: Omit<SlaPolicyRow, 'id'> }) => {
        const created = { id: nextId('sla'), ...data };
        slaPolicies.push(created);
        return Promise.resolve(created);
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Omit<SlaPolicyRow, 'id'>>;
      }) => {
        const existing = slaPolicies.find((p) => p.id === where.id);
        if (!existing) throw new Error(`SlaPolicy ${where.id} not found`);
        Object.assign(existing, data);
        return Promise.resolve(existing);
      },
    },
  };

  return { prisma, tables: { hospitals, users, access, slaPolicies } };
}

describe('resolveSeedPassword', () => {
  it('prefers SEED_DEFAULT_PASSWORD when provided', () => {
    expect(resolveSeedPassword({ SEED_DEFAULT_PASSWORD: 'from-env' })).toBe('from-env');
  });

  it('ignores a blank SEED_DEFAULT_PASSWORD outside production', () => {
    expect(resolveSeedPassword({ NODE_ENV: 'development', SEED_DEFAULT_PASSWORD: '   ' })).toBe(
      resolveSeedPassword({ NODE_ENV: 'development' }),
    );
  });

  it('refuses to use the development fallback in production', () => {
    expect(() => resolveSeedPassword({ NODE_ENV: 'production' })).toThrow(
      /SEED_DEFAULT_PASSWORD is required/,
    );
  });
});

describe('seedDatabase', () => {
  it('creates the pilot hospital, the role users, access rows and SLA policies', async () => {
    const { prisma, tables } = createFakePrisma();

    const result = await seedDatabase(prisma as never, 'hash-1');

    expect(tables.hospitals).toHaveLength(1);
    expect(tables.hospitals[0].code).toBe(seedConstants.TEST_HOSPITAL_CODE);
    // Two doctors and two reporters: the lock-conflict scenarios need a second
    // principal of the same role to be refused.
    expect(tables.users.filter((u) => u.role === 'DOCTOR')).toHaveLength(2);
    expect(tables.users.filter((u) => u.role === 'REPORTER')).toHaveLength(2);
    expect(tables.users).toHaveLength(6);
    expect(tables.users.map((u) => u.role).sort()).toEqual([
      'DOCTOR',
      'DOCTOR',
      'MANAGER',
      'OPERATION',
      'REPORTER',
      'REPORTER',
    ]);
    expect(tables.users.map((u) => u.email).sort()).toEqual([
      'doctor2@test.local',
      'doctor@test.local',
      'manager@test.local',
      'operation@test.local',
      'reporter2@test.local',
      'reporter@test.local',
    ]);
    expect(tables.access).toHaveLength(6);
    expect(tables.slaPolicies).toHaveLength(3);
    expect(result.userIds).toHaveLength(6);
    expect(result.slaPolicyIds).toHaveLength(3);
  });

  it('is idempotent: a second run creates no duplicates', async () => {
    const { prisma, tables } = createFakePrisma();

    const first = await seedDatabase(prisma as never, 'hash-1');
    const second = await seedDatabase(prisma as never, 'hash-2');

    expect(tables.hospitals).toHaveLength(1);
    expect(tables.users).toHaveLength(6);
    expect(tables.access).toHaveLength(6);
    expect(tables.slaPolicies).toHaveLength(3);
    expect(second.hospitalId).toBe(first.hospitalId);
    expect(second.userIds).toEqual(first.userIds);
    expect(second.slaPolicyIds).toEqual(first.slaPolicyIds);
  });

  it('does not reset an existing user password on re-run', async () => {
    const { prisma, tables } = createFakePrisma();

    await seedDatabase(prisma as never, 'original-hash');
    await seedDatabase(prisma as never, 'replacement-hash');

    for (const user of tables.users) {
      expect(user.passwordHash).toBe('original-hash');
    }
  });

  it('rotates passwords only when rotation is explicitly requested', async () => {
    const { prisma, tables } = createFakePrisma();

    await seedDatabase(prisma as never, 'original-hash');
    await seedDatabase(prisma as never, 'rotated-hash', { resetPasswords: true });

    for (const user of tables.users) {
      expect(user.passwordHash).toBe('rotated-hash');
    }
  });
});

describe('shouldResetPasswords', () => {
  it('is off unless the flag says otherwise', () => {
    expect(shouldResetPasswords({})).toBe(false);
    expect(shouldResetPasswords({ SEED_FORCE_PASSWORD_RESET: 'false' })).toBe(false);
    // Anything other than an explicit "true" leaves credentials alone.
    expect(shouldResetPasswords({ SEED_FORCE_PASSWORD_RESET: '1' })).toBe(false);
  });

  it('is on for an explicit true', () => {
    expect(shouldResetPasswords({ SEED_FORCE_PASSWORD_RESET: 'true' })).toBe(true);
    expect(shouldResetPasswords({ SEED_FORCE_PASSWORD_RESET: ' TRUE ' })).toBe(true);
  });

  it('seeds only the SLA categories whose durations are specified', async () => {
    const { prisma, tables } = createFakePrisma();

    await seedDatabase(prisma as never, 'hash-1');

    // YOGUN_BAKIM duration is undefined (BLOCKED_SPEC) and must not be invented.
    expect(tables.slaPolicies.map((p) => p.category).sort()).toEqual(['ACIL', 'NORMAL', 'YATAN']);
    expect(tables.slaPolicies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'ACIL', durationMinutes: 120 }),
        expect.objectContaining({ category: 'YATAN', durationMinutes: 720 }),
        expect.objectContaining({ category: 'NORMAL', durationMinutes: 1440 }),
      ]),
    );
    expect(
      tables.slaPolicies.every(
        (p) => p.warningBeforeMinutes === seedConstants.SLA_WARNING_BEFORE_MINUTES,
      ),
    ).toBe(true);
  });

  it('updates an existing active SLA policy instead of adding a second one', async () => {
    const { prisma, tables } = createFakePrisma();

    await prisma.slaPolicy.create({
      data: { category: 'ACIL', durationMinutes: 999, warningBeforeMinutes: 5, active: true },
    });

    await seedDatabase(prisma as never, 'hash-1');

    const acil = tables.slaPolicies.filter((p) => p.category === 'ACIL');
    expect(acil).toHaveLength(1);
    expect(acil[0].durationMinutes).toBe(120);
    expect(acil[0].warningBeforeMinutes).toBe(20);
  });
});
