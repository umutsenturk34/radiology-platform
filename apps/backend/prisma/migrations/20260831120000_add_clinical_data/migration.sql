-- CreateTable
CREATE TABLE "clinical_data" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "preDiagnosis" TEXT,
    "requestReason" TEXT,
    "patientComplaint" TEXT,
    "previousStudyInfo" TEXT,
    "requestingPhysician" TEXT,
    "department" TEXT,
    "additionalData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinical_data_studyId_key" ON "clinical_data"("studyId");

-- AddForeignKey
ALTER TABLE "clinical_data" ADD CONSTRAINT "clinical_data_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

