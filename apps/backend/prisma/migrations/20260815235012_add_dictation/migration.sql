-- CreateEnum
CREATE TYPE "DictationStatus" AS ENUM ('RECORDING', 'UPLOADING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "dictations" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "durationMs" INTEGER,
    "checksum" TEXT,
    "status" "DictationStatus" NOT NULL DEFAULT 'RECORDING',
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dictations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dictations_studyId_status_idx" ON "dictations"("studyId", "status");

-- CreateIndex
CREATE INDEX "dictations_doctorId_idx" ON "dictations"("doctorId");

-- AddForeignKey
ALTER TABLE "dictations" ADD CONSTRAINT "dictations_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictations" ADD CONSTRAINT "dictations_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
