-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'COMPLETED', 'WAITING_APPROVAL', 'FINAL', 'REVISION_DRAFT', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ReportSource" AS ENUM ('REPORTER', 'MANUAL', 'AI_DRAFT', 'AI_ASSISTED');

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_versions" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "source" "ReportSource" NOT NULL DEFAULT 'REPORTER',
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "revisionReason" TEXT,
    "supersedesVersionId" UUID,

    CONSTRAINT "report_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reports_studyId_key" ON "reports"("studyId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_currentVersionId_key" ON "reports"("currentVersionId");

-- CreateIndex
CREATE INDEX "report_versions_reportId_createdAt_idx" ON "report_versions"("reportId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "report_versions_reportId_versionNumber_key" ON "report_versions"("reportId", "versionNumber");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "report_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_supersedesVersionId_fkey" FOREIGN KEY ("supersedesVersionId") REFERENCES "report_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
