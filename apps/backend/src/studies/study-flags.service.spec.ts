import { StudyStatus } from '@radiology/shared';
import { StudyFlagsService } from './study-flags.service';
import type { PrismaService } from '../prisma/prisma.service';

const PATIENT = 'patient-1';

interface StudyRow {
  id: string;
  patientId: string;
  status: string;
}

/**
 * Applies the same two filters the service asks Prisma for, so the assertions
 * below are about the derivation rather than about a stub that answers yes.
 */
function createService(studies: StudyRow[], notes: Array<{ studyId: string }> = []) {
  const queries: { studyWhere?: Record<string, unknown> } = {};

  const prisma = {
    informationNote: {
      findMany: ({ where }: { where: { studyId: { in: string[] } } }) =>
        Promise.resolve(notes.filter((note) => where.studyId.in.includes(note.studyId))),
    },
    study: {
      findMany: ({ where }: { where: Record<string, unknown> }) => {
        queries.studyWhere = where;
        const patientIds = (where.patientId as { in: string[] }).in;
        const excluded = (where.status as { notIn: string[] }).notIn;

        return Promise.resolve(
          studies.filter(
            (row) => patientIds.includes(row.patientId) && !excluded.includes(row.status),
          ),
        );
      },
    },
  } as unknown as PrismaService;

  return { service: new StudyFlagsService(prisma), queries };
}

function study(id: string, status: string, patientId = PATIENT): StudyRow {
  return { id, patientId, status };
}

describe('StudyFlagsService', () => {
  it('queries nothing at all for an empty page', async () => {
    const { service, queries } = createService([]);

    await expect(service.forStudies([])).resolves.toEqual(new Map());
    expect(queries.studyWhere).toBeUndefined();
  });

  it('flags a study that carries an information note', async () => {
    const rows = [study('study-1', StudyStatus.UNREAD)];
    const { service } = createService(rows, [{ studyId: 'study-1' }]);

    const flags = await service.forStudy(rows[0]);

    expect(flags.hasInformation).toBe(true);
  });

  it('leaves hasInformation false for a study with no notes', async () => {
    const rows = [study('study-1', StudyStatus.UNREAD)];
    const { service } = createService(rows, [{ studyId: 'study-other' }]);

    await expect(service.forStudy(rows[0])).resolves.toMatchObject({ hasInformation: false });
  });

  it('reads imageMissing off the status', async () => {
    const missing = study('study-1', StudyStatus.IMAGE_MISSING);
    const { service } = createService([missing]);

    await expect(service.forStudy(missing)).resolves.toMatchObject({ imageMissing: true });
  });

  it.each([StudyStatus.REVISION_REQUESTED, StudyStatus.REVISION_IN_PROGRESS])(
    'reports an open revision in %s',
    async (status) => {
      const row = study('study-1', status);
      const { service } = createService([row]);

      await expect(service.forStudy(row)).resolves.toMatchObject({ hasRevisionRequest: true });
    },
  );

  it('does not report a revision for an ordinary status', async () => {
    const row = study('study-1', StudyStatus.READING);
    const { service } = createService([row]);

    await expect(service.forStudy(row)).resolves.toMatchObject({ hasRevisionRequest: false });
  });

  it('flags a sibling study of the same patient that has no final report', async () => {
    const rows = [study('study-1', StudyStatus.UNREAD), study('study-2', StudyStatus.READING)];
    const { service } = createService(rows);

    const flags = await service.forStudies(rows);

    expect(flags.get('study-1')?.hasUnreportedSiblingStudy).toBe(true);
    expect(flags.get('study-2')?.hasUnreportedSiblingStudy).toBe(true);
  });

  it('is never its own sibling', async () => {
    const only = study('study-1', StudyStatus.UNREAD);
    const { service } = createService([only]);

    await expect(service.forStudy(only)).resolves.toMatchObject({
      hasUnreportedSiblingStudy: false,
    });
  });

  it.each([
    StudyStatus.FINAL,
    StudyStatus.HBYS_PENDING,
    StudyStatus.HBYS_SENT,
    // An HBYS delivery failure is an integration problem; the report exists.
    StudyStatus.HBYS_FAILED,
    // Closed on purpose, so not outstanding work either.
    StudyStatus.WONT_REPORT,
  ])('does not count a sibling in %s as unreported', async (status) => {
    const rows = [study('study-1', StudyStatus.UNREAD), study('study-2', status)];
    const { service } = createService(rows);

    const flags = await service.forStudies(rows);

    expect(flags.get('study-1')?.hasUnreportedSiblingStudy).toBe(false);
  });

  it('does not treat another patient’s open study as a sibling', async () => {
    const rows = [
      study('study-1', StudyStatus.UNREAD),
      study('study-2', StudyStatus.UNREAD, 'patient-2'),
    ];
    const { service } = createService(rows);

    const flags = await service.forStudies(rows);

    expect(flags.get('study-1')?.hasUnreportedSiblingStudy).toBe(false);
  });

  it('finds a sibling that is not itself on the page', async () => {
    const onPage = study('study-1', StudyStatus.UNREAD);
    // study-2 belongs to the same patient but is not part of the requested page.
    const { service } = createService([onPage, study('study-2', StudyStatus.WAITING_APPROVAL)]);

    await expect(service.forStudy(onPage)).resolves.toMatchObject({
      hasUnreportedSiblingStudy: true,
    });
  });
});
