-- Index foreign keys used by relation joins, cascades, and ownership queries.
CREATE INDEX "ingestion_jobs_documentAssetId_idx" ON "ingestion_jobs"("documentAssetId");
CREATE INDEX "ingestion_jobs_audioAssetId_idx" ON "ingestion_jobs"("audioAssetId");
CREATE INDEX "questions_groupId_idx" ON "questions"("groupId");
CREATE INDEX "mini_test_questions_questionId_idx" ON "mini_test_questions"("questionId");
CREATE INDEX "test_attempts_testId_idx" ON "test_attempts"("testId");
CREATE INDEX "user_answers_attemptId_idx" ON "user_answers"("attemptId");
CREATE INDEX "user_answers_questionId_idx" ON "user_answers"("questionId");
CREATE INDEX "question_skill_tags_skillTagId_idx" ON "question_skill_tags"("skillTagId");
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");
