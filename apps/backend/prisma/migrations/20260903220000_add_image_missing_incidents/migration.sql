-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "image_missing_incidents" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "reportedBy" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedBy" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,

    CONSTRAINT "image_missing_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "image_missing_incidents_studyId_status_idx" ON "image_missing_incidents"("studyId", "status");

-- CreateIndex
CREATE INDEX "image_missing_incidents_status_reportedAt_idx" ON "image_missing_incidents"("status", "reportedAt");

-- AddForeignKey
ALTER TABLE "image_missing_incidents" ADD CONSTRAINT "image_missing_incidents_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_missing_incidents" ADD CONSTRAINT "image_missing_incidents_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_missing_incidents" ADD CONSTRAINT "image_missing_incidents_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

