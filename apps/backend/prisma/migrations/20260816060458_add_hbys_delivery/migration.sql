-- CreateEnum
CREATE TYPE "HbysDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "hbys_deliveries" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "reportVersionId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "status" "HbysDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "externalReportId" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hbys_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hbys_delivery_attempts" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "HbysDeliveryStatus" NOT NULL,
    "httpStatus" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "requestMetadata" JSONB,
    "responseMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hbys_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hbys_deliveries_idempotencyKey_key" ON "hbys_deliveries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "hbys_deliveries_status_queuedAt_idx" ON "hbys_deliveries"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "hbys_deliveries_studyId_idx" ON "hbys_deliveries"("studyId");

-- CreateIndex
CREATE INDEX "hbys_deliveries_hospitalId_status_idx" ON "hbys_deliveries"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "hbys_delivery_attempts_deliveryId_startedAt_idx" ON "hbys_delivery_attempts"("deliveryId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "hbys_delivery_attempts_deliveryId_attemptNumber_key" ON "hbys_delivery_attempts"("deliveryId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "hbys_deliveries" ADD CONSTRAINT "hbys_deliveries_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hbys_deliveries" ADD CONSTRAINT "hbys_deliveries_reportVersionId_fkey" FOREIGN KEY ("reportVersionId") REFERENCES "report_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hbys_delivery_attempts" ADD CONSTRAINT "hbys_delivery_attempts_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "hbys_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
