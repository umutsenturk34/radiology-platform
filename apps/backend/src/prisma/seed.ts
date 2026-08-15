/**
 * Pilot seed (TASK_QUEUE BACKEND-005).
 *
 * Idempotent: running it repeatedly must not create duplicates, so every write
 * is an upsert keyed on a real unique constraint.
 *
 * Seeds only what the pilot workflow needs to start:
 *   - one TEST hospital
 *   - one user per role, all scoped to that hospital
 *   - SLA policies for the three categories whose durations are specified
 *
 * YOGUN_BAKIM is deliberately NOT seeded: its SLA duration is undefined
 * (BLOCKED_SPEC) and must not be invented (CLAUDE.md section 31).
 */
import { PatientCategory, PrismaClient, UserRole } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const TEST_HOSPITAL_CODE = 'TEST_HOSPITAL';

/**
 * Development-only fallback. Documented in apps/backend/.env.example so the
 * value never has to be echoed to a log (CLAUDE.md section 42).
 */
const DEV_FALLBACK_PASSWORD = 'PilotTest!2026';

interface SeedUser {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'doctor@test.local',
    username: 'doctor',
    firstName: 'Test',
    lastName: 'Doktor',
    role: UserRole.DOCTOR,
  },
  {
    email: 'reporter@test.local',
    username: 'reporter',
    firstName: 'Test',
    lastName: 'Raportor',
    role: UserRole.REPORTER,
  },
  {
    email: 'operation@test.local',
    username: 'operation',
    firstName: 'Test',
    lastName: 'Operasyon',
    role: UserRole.OPERATION,
  },
  {
    email: 'manager@test.local',
    username: 'manager',
    firstName: 'Test',
    lastName: 'Yonetici',
    role: UserRole.MANAGER,
  },
  // A second doctor and reporter exist so the mandatory lock-conflict
  // scenarios can be run at all: E2E-003 needs a second doctor to be refused
  // with 423, and E2E-004 the same for a second reporter (CLAUDE.md 61).
  {
    email: 'doctor2@test.local',
    username: 'doctor2',
    firstName: 'Test',
    lastName: 'Doktor Iki',
    role: UserRole.DOCTOR,
  },
  {
    email: 'reporter2@test.local',
    username: 'reporter2',
    firstName: 'Test',
    lastName: 'Raportor Iki',
    role: UserRole.REPORTER,
  },
];

/** docs/DATA_MODEL.md section 64. YOGUN_BAKIM is intentionally absent. */
const SLA_POLICIES: Array<{ category: PatientCategory; durationMinutes: number }> = [
  { category: PatientCategory.ACIL, durationMinutes: 120 },
  { category: PatientCategory.YATAN, durationMinutes: 720 },
  { category: PatientCategory.NORMAL, durationMinutes: 1440 },
];

const SLA_WARNING_BEFORE_MINUTES = 20;

export function resolveSeedPassword(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SEED_DEFAULT_PASSWORD?.trim();
  if (configured) return configured;

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'SEED_DEFAULT_PASSWORD is required when NODE_ENV=production. ' +
        'Pilot default passwords must never reach a production database.',
    );
  }

  return DEV_FALLBACK_PASSWORD;
}

export interface SeedResult {
  hospitalId: string;
  userIds: string[];
  slaPolicyIds: string[];
}

export async function seedDatabase(
  prisma: Pick<PrismaClient, 'hospital' | 'user' | 'userHospitalAccess' | 'slaPolicy'>,
  passwordHash: string,
): Promise<SeedResult> {
  const hospital = await prisma.hospital.upsert({
    where: { code: TEST_HOSPITAL_CODE },
    update: {},
    create: {
      code: TEST_HOSPITAL_CODE,
      name: 'Test Hastanesi',
      shortName: 'TEST',
      status: 'TEST',
      timezone: 'Europe/Istanbul',
      integrationKey: 'test-hospital-integration-key',
    },
  });

  const userIds: string[] = [];
  for (const seedUser of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { email: seedUser.email },
      // Password is intentionally not reset on re-run: re-seeding an existing
      // environment must not silently change credentials already in use.
      update: {
        username: seedUser.username,
        firstName: seedUser.firstName,
        lastName: seedUser.lastName,
        role: seedUser.role,
        status: 'ACTIVE',
      },
      create: {
        email: seedUser.email,
        username: seedUser.username,
        passwordHash,
        firstName: seedUser.firstName,
        lastName: seedUser.lastName,
        role: seedUser.role,
        status: 'ACTIVE',
      },
    });
    userIds.push(user.id);

    await prisma.userHospitalAccess.upsert({
      where: { userId_hospitalId: { userId: user.id, hospitalId: hospital.id } },
      update: {},
      create: { userId: user.id, hospitalId: hospital.id },
    });
  }

  // SlaPolicy has no unique constraint (superseded policies remain as inactive
  // history), so idempotency is achieved by looking up the active row first.
  const slaPolicyIds: string[] = [];
  for (const policy of SLA_POLICIES) {
    const existing = await prisma.slaPolicy.findFirst({
      where: { category: policy.category, active: true },
    });

    if (existing) {
      const updated = await prisma.slaPolicy.update({
        where: { id: existing.id },
        data: {
          durationMinutes: policy.durationMinutes,
          warningBeforeMinutes: SLA_WARNING_BEFORE_MINUTES,
        },
      });
      slaPolicyIds.push(updated.id);
    } else {
      const created = await prisma.slaPolicy.create({
        data: {
          category: policy.category,
          durationMinutes: policy.durationMinutes,
          warningBeforeMinutes: SLA_WARNING_BEFORE_MINUTES,
          active: true,
        },
      });
      slaPolicyIds.push(created.id);
    }
  }

  return { hospitalId: hospital.id, userIds, slaPolicyIds };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const password = resolveSeedPassword();
    const passwordHash = await hash(password);
    const result = await seedDatabase(prisma, passwordHash);

    // The password itself is never printed.
    process.stdout.write(
      `${JSON.stringify({
        message: 'Seed completed',
        hospital: TEST_HOSPITAL_CODE,
        users: result.userIds.length,
        slaPolicies: result.slaPolicyIds.length,
        passwordSource: process.env.SEED_DEFAULT_PASSWORD
          ? 'SEED_DEFAULT_PASSWORD'
          : 'development fallback (see .env.example)',
      })}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when executed directly, so the functions above stay unit testable.
if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        message: 'Seed failed',
        reason: error instanceof Error ? error.message : 'unknown error',
      })}\n`,
    );
    process.exitCode = 1;
  });
}

export const seedConstants = {
  TEST_HOSPITAL_CODE,
  SEED_USERS,
  SLA_POLICIES,
  SLA_WARNING_BEFORE_MINUTES,
} satisfies Record<string, unknown>;
