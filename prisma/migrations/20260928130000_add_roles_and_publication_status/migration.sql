CREATE TYPE "UserRole" AS ENUM ('USER', 'REVIEWER', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "QuestionPublicationStatus" AS ENUM ('PRIVATE', 'LEGACY', 'PUBLISHED', 'ARCHIVED');

ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';
ALTER TABLE "users" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "questions" ADD COLUMN "publicationStatus" "QuestionPublicationStatus" NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE "questions" ADD COLUMN "contentRevision" INTEGER NOT NULL DEFAULT 1;

-- Existing global questions remain available to signed-in users only until
-- an admin audits and explicitly publishes them for guests.
UPDATE "questions" SET "publicationStatus" = 'LEGACY' WHERE "ownerId" IS NULL;

CREATE TABLE "authorization_audit_events" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "authorization_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guest_usage" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guest_usage_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "user_ai_usage" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_ai_usage_pkey" PRIMARY KEY ("key")
);

CREATE TYPE "ExplanationCacheStatus" AS ENUM ('GENERATING', 'READY', 'FAILED', 'HIDDEN');
CREATE TABLE "question_explanation_cache" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "contentRevision" INTEGER NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'vi',
    "promptVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "ExplanationCacheStatus" NOT NULL DEFAULT 'GENERATING',
    "explanation" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "question_explanation_cache_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "authorization_audit_events_actorId_createdAt_idx" ON "authorization_audit_events"("actorId", "createdAt");
CREATE INDEX "authorization_audit_events_targetType_targetId_createdAt_idx" ON "authorization_audit_events"("targetType", "targetId", "createdAt");
CREATE INDEX "guest_usage_expiresAt_idx" ON "guest_usage"("expiresAt");
CREATE INDEX "user_ai_usage_expiresAt_idx" ON "user_ai_usage"("expiresAt");
CREATE UNIQUE INDEX "question_explanation_cache_questionId_contentRevision_locale_promptVersion_key" ON "question_explanation_cache"("questionId", "contentRevision", "locale", "promptVersion");
CREATE INDEX "question_explanation_cache_status_updatedAt_idx" ON "question_explanation_cache"("status", "updatedAt");
CREATE INDEX "questions_publicationStatus_part_idx" ON "questions"("publicationStatus", "part");
ALTER TABLE "authorization_audit_events" ADD CONSTRAINT "authorization_audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "question_explanation_cache" ADD CONSTRAINT "question_explanation_cache_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
