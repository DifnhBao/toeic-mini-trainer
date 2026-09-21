# Mobile implementation roadmap

## Architecture

- `mobile/`: Expo SDK 57 client for Android and iOS.
- Next.js root application: web/admin UI and versioned API.
- PostgreSQL/Prisma: accounts, question bank, attempts, explanations, and
  hashed mobile refresh sessions.
- Object storage (next phase): PDF, image, and audio objects accessed through
  short-lived signed URLs.

## Delivery stages

1. **API and auth security — complete in source**
   - Versioned native auth endpoints.
   - Google/Apple ID token verification.
   - Short-lived access tokens and rotating, hashed refresh tokens.
   - Migration prepared at
     `prisma/migrations/20260921090000_add_mobile_sessions/migration.sql`.
2. **Expo shell and secure session — complete**
   - Expo Router navigation and authenticated tab shell.
   - Google and Apple sign-in UI.
   - SecureStore refresh token persistence and automatic token refresh.
   - Android and iOS production JS bundles verified.
3. **Learning flow — complete in source**
   - Bearer-authenticated test generation API.
   - Test runner with audio, question groups, timer, autosave, results/history.
4. **AI Coach — complete in source, pending device testing**
   - Mobile chat (`/api/v1/ai/coach`): bounded history, Bearer auth, per-user
     rate limit; conversation stays in app memory only, never persisted.
   - Wrong-answer explanations (`/api/v1/ai/explain`): ownership-checked,
     cache-first via `AiExplanation`, generated on demand from the result screen.
5. **Document/audio ingestion**
   - Signed object upload, type/size validation, background extraction jobs.
6. **Offline and reliability**
   - Local attempt drafts, retry queue, network state, conflict rules.
7. **Release readiness**
   - EAS profiles, privacy disclosures, device tests, observability, store assets.

## Non-negotiable security rules

- No provider secret, database URL, AI key, or JWT signing secret in the mobile
  bundle.
- Production API traffic is HTTPS only.
- The API never returns a correct answer before an attempt is submitted.
- Uploaded files are private by default and served with expiring signed URLs.
- Production rate limiting must use a shared store (for example Redis); the
  in-memory limiter currently present is a development/single-instance guard.
- Apply database migrations through a reviewed deployment job, not an app boot
  side effect.
