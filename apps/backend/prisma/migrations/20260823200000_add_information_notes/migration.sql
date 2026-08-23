-- CreateTable
CREATE TABLE "information_notes" (
    "id" UUID NOT NULL,
    "studyId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "authorRole" "UserRole" NOT NULL,
    "currentContent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "information_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "information_note_versions" (
    "id" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "information_note_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "information_notes_studyId_createdAt_idx" ON "information_notes"("studyId", "createdAt");

-- CreateIndex
CREATE INDEX "information_notes_authorUserId_idx" ON "information_notes"("authorUserId");

-- CreateIndex
CREATE INDEX "information_note_versions_noteId_createdAt_idx" ON "information_note_versions"("noteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "information_note_versions_noteId_versionNumber_key" ON "information_note_versions"("noteId", "versionNumber");

-- AddForeignKey
ALTER TABLE "information_notes" ADD CONSTRAINT "information_notes_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "information_notes" ADD CONSTRAINT "information_notes_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "information_note_versions" ADD CONSTRAINT "information_note_versions_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "information_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "information_note_versions" ADD CONSTRAINT "information_note_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

