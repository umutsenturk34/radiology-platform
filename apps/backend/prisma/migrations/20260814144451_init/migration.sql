-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DOCTOR', 'REPORTER', 'OPERATION', 'MANAGER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "HospitalStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'TEST');

-- CreateEnum
CREATE TYPE "PatientCategory" AS ENUM ('ACIL', 'YOGUN_BAKIM', 'YATAN', 'NORMAL');

-- CreateEnum
CREATE TYPE "StudyStatus" AS ENUM ('INITIAL', 'WAITING_ACCEPTANCE', 'IMAGES_PENDING', 'UNREAD', 'READING', 'READ', 'WAITING_TRANSCRIPTION', 'TRANSCRIBING', 'WAITING_APPROVAL', 'FINAL', 'HBYS_PENDING', 'HBYS_SENT', 'HBYS_FAILED', 'IMAGE_MISSING', 'WONT_REPORT', 'HOSPITAL_DOCTOR', 'REVISION_REQUESTED', 'REVISION_IN_PROGRESS', 'ADDENDUM_REQUIRED');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('DOCTOR', 'REPORTER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitals" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "status" "HospitalStatus" NOT NULL DEFAULT 'ACTIVE',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "integrationKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_hospital_access" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID,

    CONSTRAINT "user_hospital_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "externalPatientId" TEXT NOT NULL,
    "nationalIdMasked" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "gender" TEXT,
    "anonymousCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studies" (
    "id" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "accessionNumber" TEXT NOT NULL,
    "externalOrderId" TEXT,
    "externalProtocolId" TEXT,
    "modality" TEXT,
    "studyDescription" TEXT,
    "category" "PatientCategory" NOT NULL,
    "status" "StudyStatus" NOT NULL DEFAULT 'INITIAL',
    "studyInstanceUid" TEXT,
    "firstHl7ReceivedAt" TIMESTAMP(3),
    "secondHl7ReceivedAt" TIMESTAMP(3),
    "arrivalAt" TIMESTAMP(3),
    "slaDeadlineAt" TIMESTAMP(3),
    "imagesAvailableAt" TIMESTAMP(3),
    "assignedDoctorId" UUID,
    "assignedReporterId" UUID,
    "readingStartedAt" TIMESTAMP(3),
    "readingCompletedAt" TIMESTAMP(3),
    "transcriptionStartedAt" TIMESTAMP(3),
    "transcriptionCompletedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_status_history" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "fromStatus" "StudyStatus",
    "toStatus" "StudyStatus" NOT NULL,
    "actorUserId" UUID,
    "actorRole" "UserRole",
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_assignments" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "AssignmentType" NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "assignedBy" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" UUID,
    "actorRole" "UserRole",
    "hospitalId" UUID,
    "patientId" UUID,
    "studyId" UUID,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" UUID NOT NULL,
    "category" "PatientCategory" NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "warningBeforeMinutes" INTEGER NOT NULL DEFAULT 20,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refreshTokenHash_key" ON "user_sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");

-- CreateIndex
CREATE INDEX "user_sessions_expiresAt_idx" ON "user_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "hospitals_code_key" ON "hospitals"("code");

-- CreateIndex
CREATE UNIQUE INDEX "hospitals_integrationKey_key" ON "hospitals"("integrationKey");

-- CreateIndex
CREATE INDEX "hospitals_status_idx" ON "hospitals"("status");

-- CreateIndex
CREATE INDEX "user_hospital_access_hospitalId_idx" ON "user_hospital_access"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "user_hospital_access_userId_hospitalId_key" ON "user_hospital_access"("userId", "hospitalId");

-- CreateIndex
CREATE INDEX "patients_hospitalId_lastName_firstName_idx" ON "patients"("hospitalId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "patients_hospitalId_externalPatientId_key" ON "patients"("hospitalId", "externalPatientId");

-- CreateIndex
CREATE INDEX "studies_hospitalId_status_arrivalAt_idx" ON "studies"("hospitalId", "status", "arrivalAt");

-- CreateIndex
CREATE INDEX "studies_hospitalId_category_idx" ON "studies"("hospitalId", "category");

-- CreateIndex
CREATE INDEX "studies_status_idx" ON "studies"("status");

-- CreateIndex
CREATE INDEX "studies_slaDeadlineAt_idx" ON "studies"("slaDeadlineAt");

-- CreateIndex
CREATE INDEX "studies_assignedDoctorId_idx" ON "studies"("assignedDoctorId");

-- CreateIndex
CREATE INDEX "studies_assignedReporterId_idx" ON "studies"("assignedReporterId");

-- CreateIndex
CREATE INDEX "studies_patientId_idx" ON "studies"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "studies_hospitalId_accessionNumber_key" ON "studies"("hospitalId", "accessionNumber");

-- CreateIndex
CREATE INDEX "study_status_history_studyId_createdAt_idx" ON "study_status_history"("studyId", "createdAt");

-- CreateIndex
CREATE INDEX "study_status_history_toStatus_idx" ON "study_status_history"("toStatus");

-- CreateIndex
CREATE INDEX "study_assignments_studyId_type_idx" ON "study_assignments"("studyId", "type");

-- CreateIndex
CREATE INDEX "study_assignments_userId_type_idx" ON "study_assignments"("userId", "type");

-- CreateIndex
CREATE INDEX "audit_logs_studyId_createdAt_idx" ON "audit_logs"("studyId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_hospitalId_createdAt_idx" ON "audit_logs"("hospitalId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_eventType_createdAt_idx" ON "audit_logs"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "sla_policies_category_active_idx" ON "sla_policies"("category", "active");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hospital_access" ADD CONSTRAINT "user_hospital_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hospital_access" ADD CONSTRAINT "user_hospital_access_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_hospital_access" ADD CONSTRAINT "user_hospital_access_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studies" ADD CONSTRAINT "studies_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studies" ADD CONSTRAINT "studies_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studies" ADD CONSTRAINT "studies_assignedDoctorId_fkey" FOREIGN KEY ("assignedDoctorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studies" ADD CONSTRAINT "studies_assignedReporterId_fkey" FOREIGN KEY ("assignedReporterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_status_history" ADD CONSTRAINT "study_status_history_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_status_history" ADD CONSTRAINT "study_status_history_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_assignments" ADD CONSTRAINT "study_assignments_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_assignments" ADD CONSTRAINT "study_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_assignments" ADD CONSTRAINT "study_assignments_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
