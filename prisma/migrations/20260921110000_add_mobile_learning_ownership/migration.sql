-- AlterTable
ALTER TABLE "mini_tests" ADD COLUMN "createdById" TEXT;

-- AlterTable
ALTER TABLE "test_attempts" ADD COLUMN "clientSubmissionId" TEXT,
ADD COLUMN "durationSeconds" INTEGER;

-- CreateIndex
CREATE INDEX "mini_tests_createdById_idx" ON "mini_tests"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "test_attempts_clientSubmissionId_key" ON "test_attempts"("clientSubmissionId");

-- AddForeignKey
ALTER TABLE "mini_tests" ADD CONSTRAINT "mini_tests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
