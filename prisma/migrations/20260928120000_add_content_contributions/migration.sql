CREATE TYPE "ContributionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "content_contributions" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceJobId" TEXT NOT NULL,
    "status" "ContributionStatus" NOT NULL DEFAULT 'PENDING',
    "data" JSONB NOT NULL,
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "content_contributions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "question_groups" ADD COLUMN "contributionId" TEXT;
ALTER TABLE "questions" ADD COLUMN "contributionId" TEXT;

CREATE UNIQUE INDEX "content_contributions_sourceJobId_key" ON "content_contributions"("sourceJobId");
CREATE INDEX "content_contributions_status_createdAt_idx" ON "content_contributions"("status", "createdAt");
CREATE INDEX "content_contributions_ownerId_createdAt_idx" ON "content_contributions"("ownerId", "createdAt");
CREATE INDEX "question_groups_contributionId_idx" ON "question_groups"("contributionId");
CREATE INDEX "questions_contributionId_idx" ON "questions"("contributionId");

ALTER TABLE "content_contributions" ADD CONSTRAINT "content_contributions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_contributions" ADD CONSTRAINT "content_contributions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "content_contributions" ADD CONSTRAINT "content_contributions_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "ingestion_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "question_groups" ADD CONSTRAINT "question_groups_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "content_contributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "content_contributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
