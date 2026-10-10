param([string]$Container = 'toeic-release-test-20261008')
$ErrorActionPreference = 'Stop'
if ($Container -notmatch '^toeic-release-test-[0-9]{8}$') {
  throw 'Only a named local release-test container is accepted.'
}
$restoreDatabase = 'toeic_restore_test_' + ([Guid]::NewGuid().ToString('N').Substring(0, 12))
$dumpPath = '/tmp/' + $restoreDatabase + '.dump'
$restoreCreated = $false
$fixtureCreated = $false
$fixtureUser = [Guid]::NewGuid().ToString()
$fixtureQuestion = [Guid]::NewGuid().ToString()
$fixtureTest = [Guid]::NewGuid().ToString()
$fixtureAttempt = [Guid]::NewGuid().ToString()
$fixtureAnswer = [Guid]::NewGuid().ToString()
$taskStarted = Get-Date

function Invoke-TestDocker([string[]]$DockerArguments) {
  $taskOutput = & docker @DockerArguments
  if ($LASTEXITCODE -ne 0) { throw "Docker test operation failed (exit $LASTEXITCODE)." }
  return $taskOutput
}

function Invoke-TestSql([string]$Database, [string]$Sql) {
  # Pipe SQL over stdin; Windows PowerShell 5 strips embedded quotes when SQL
  # is passed as a native -c argument, which breaks case-sensitive columns.
  $taskOutput = $Sql | & docker exec -i $Container psql -U test -d $Database -v ON_ERROR_STOP=1 -At
  if ($LASTEXITCODE -ne 0) { throw "Local test SQL failed (exit $LASTEXITCODE)." }
  return $taskOutput
}

try {
  # No host mounts, credentials from .env, cloud access, reset or existing DB
  # targets. A new UUID-derived database receives the restore.
  $fixtureSql = @"
BEGIN;
INSERT INTO users (id, email, "updatedAt") VALUES ('$fixtureUser', '$fixtureUser@test.invalid', NOW());
INSERT INTO questions (id, "ownerId", part, content, options, "correctAnswer") VALUES ('$fixtureQuestion', '$fixtureUser', 5, 'Backup fixture', '{"A":"yes","B":"no"}', 'A');
INSERT INTO mini_tests (id, title, "createdById") VALUES ('$fixtureTest', 'Backup fixture', '$fixtureUser');
INSERT INTO mini_test_questions ("testId", "questionId", "orderIndex") VALUES ('$fixtureTest', '$fixtureQuestion', 1);
INSERT INTO test_attempts (id, "userId", "testId", score) VALUES ('$fixtureAttempt', '$fixtureUser', '$fixtureTest', 1);
INSERT INTO user_answers (id, "attemptId", "questionId", "selectedOption", "isCorrect") VALUES ('$fixtureAnswer', '$fixtureAttempt', '$fixtureQuestion', 'A', TRUE);
COMMIT;
"@
  Invoke-TestSql 'toeic_release_test' $fixtureSql | Out-Null
  $fixtureCreated = $true
  $countSql = 'SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM questions), (SELECT count(*) FROM test_attempts), (SELECT count(*) FROM user_answers), (SELECT count(*) FROM uploaded_assets), (SELECT count(*) FROM ingestion_jobs), (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL);'
  $beforeCounts = Invoke-TestSql 'toeic_release_test' $countSql
  Invoke-TestDocker @('exec', $Container, 'pg_dump', '-U', 'test', '-d', 'toeic_release_test', '--format=custom', '--file', $dumpPath) | Out-Null
  Invoke-TestDocker @('exec', $Container, 'createdb', '-U', 'test', $restoreDatabase) | Out-Null
  $restoreCreated = $true
  Invoke-TestDocker @('exec', $Container, 'pg_restore', '-U', 'test', '-d', $restoreDatabase, '--no-owner', '--no-privileges', '--exit-on-error', $dumpPath) | Out-Null
  $afterCounts = Invoke-TestSql $restoreDatabase $countSql
  if (($beforeCounts -join '') -ne ($afterCounts -join '')) { throw 'Restored table counts differ.' }
  $verifySql = "SELECT count(*) FROM user_answers a JOIN test_attempts t ON t.id=a.`"attemptId`" JOIN questions q ON q.id=a.`"questionId`" WHERE a.id='$fixtureAnswer' AND t.`"userId`"='$fixtureUser' AND q.id='$fixtureQuestion' AND a.`"isCorrect`"=TRUE;"
  $fixtureVerified = Invoke-TestSql $restoreDatabase $verifySql
  if (($fixtureVerified -join '') -ne '1') { throw 'Restored learning fixture relations are invalid.' }
  [pscustomobject]@{ Result = 'PASS'; Source = 'toeic_release_test'; Restore = $restoreDatabase; Counts = ($afterCounts -join ''); Seconds = [Math]::Round(((Get-Date) - $taskStarted).TotalSeconds, 2) }
} finally {
  if ($restoreCreated) {
    Invoke-TestDocker @('exec', $Container, 'dropdb', '-U', 'test', $restoreDatabase) | Out-Null
  }
  if ($fixtureCreated) {
    $cleanupSql = "BEGIN; DELETE FROM mini_tests WHERE id='$fixtureTest'; DELETE FROM users WHERE id='$fixtureUser'; COMMIT;"
    Invoke-TestSql 'toeic_release_test' $cleanupSql | Out-Null
  }
  Invoke-TestDocker @('exec', $Container, 'rm', '-f', $dumpPath) | Out-Null
}
