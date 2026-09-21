-- CreateEnum
CREATE TYPE "GroupType" AS ENUM ('AUDIO', 'TEXT', 'MIXED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_groups" (
    "id" TEXT NOT NULL,
    "groupType" "GroupType" NOT NULL,
    "audioUrl" TEXT,
    "imageUrl" TEXT,
    "passageText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "groupId" TEXT,
    "part" INTEGER NOT NULL,
    "content" TEXT,
    "options" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mini_tests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mini_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mini_test_questions" (
    "testId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "mini_test_questions_pkey" PRIMARY KEY ("testId","questionId")
);

-- CreateTable
CREATE TABLE "test_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "score" INTEGER,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_answers" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOption" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_explanations" (
    "id" TEXT NOT NULL,
    "userAnswerId" TEXT NOT NULL,
    "explanationText" TEXT NOT NULL,
    "suggestedSkills" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "skill_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_skill_tags" (
    "questionId" TEXT NOT NULL,
    "skillTagId" TEXT NOT NULL,

    CONSTRAINT "question_skill_tags_pkey" PRIMARY KEY ("questionId","skillTagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "questions_part_idx" ON "questions"("part");

-- CreateIndex
CREATE INDEX "test_attempts_userId_idx" ON "test_attempts"("userId");

-- CreateIndex
CREATE INDEX "user_answers_isCorrect_idx" ON "user_answers"("isCorrect");

-- CreateIndex
CREATE UNIQUE INDEX "ai_explanations_userAnswerId_key" ON "ai_explanations"("userAnswerId");

-- CreateIndex
CREATE UNIQUE INDEX "skill_tags_name_key" ON "skill_tags"("name");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "question_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mini_test_questions" ADD CONSTRAINT "mini_test_questions_testId_fkey" FOREIGN KEY ("testId") REFERENCES "mini_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mini_test_questions" ADD CONSTRAINT "mini_test_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_testId_fkey" FOREIGN KEY ("testId") REFERENCES "mini_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_answers" ADD CONSTRAINT "user_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "test_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_answers" ADD CONSTRAINT "user_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_explanations" ADD CONSTRAINT "ai_explanations_userAnswerId_fkey" FOREIGN KEY ("userAnswerId") REFERENCES "user_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_skill_tags" ADD CONSTRAINT "question_skill_tags_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_skill_tags" ADD CONSTRAINT "question_skill_tags_skillTagId_fkey" FOREIGN KEY ("skillTagId") REFERENCES "skill_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
