-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'IMPORTING', 'IMPORTED', 'FAILED');

-- AlterTable
ALTER TABLE "question_groups" ADD COLUMN "audioAssetId" TEXT,
ADD COLUMN "imageAssetId" TEXT,
ADD COLUMN "ownerId" TEXT;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN "ownerId" TEXT;

-- CreateTable
CREATE TABLE "ingestion_jobs" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "documentAssetId" TEXT NOT NULL,
    "audioAssetId" TEXT,
    "status" "IngestionStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "errorCode" TEXT,
    "importedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_groups_audioAssetId_idx" ON "question_groups"("audioAssetId");

-- CreateIndex
CREATE INDEX "question_groups_imageAssetId_idx" ON "question_groups"("imageAssetId");

-- CreateIndex
CREATE INDEX "question_groups_ownerId_idx" ON "question_groups"("ownerId");

-- CreateIndex
CREATE INDEX "questions_ownerId_part_idx" ON "questions"("ownerId", "part");

-- CreateIndex
CREATE INDEX "ingestion_jobs_ownerId_createdAt_idx" ON "ingestion_jobs"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "ingestion_jobs_status_createdAt_idx" ON "ingestion_jobs"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "question_groups" ADD CONSTRAINT "question_groups_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "uploaded_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_groups" ADD CONSTRAINT "question_groups_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "uploaded_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_groups" ADD CONSTRAINT "question_groups_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_documentAssetId_fkey" FOREIGN KEY ("documentAssetId") REFERENCES "uploaded_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_audioAssetId_fkey" FOREIGN KEY ("audioAssetId") REFERENCES "uploaded_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
