# TOEIC Mini Trainer Mobile

Expo SDK 57 / React Native client for Android and iOS. The Next.js application in
the repository root remains the API and web/admin application.

## Local configuration

1. Copy `.env.example` to `.env.local`.
2. Set `EXPO_PUBLIC_API_URL` to an HTTPS API URL. Plain HTTP is accepted only in
   a development bundle.
3. Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the Web OAuth client in the same
   Google Cloud project as the Android client. These IDs are public identifiers;
   never put client secrets, database credentials, AI keys, or JWT secrets in an
   `EXPO_PUBLIC_*` value.

The backend verifies native Google ID tokens against
`GOOGLE_MOBILE_WEB_CLIENT_ID` (or its existing `GOOGLE_CLIENT_ID` fallback).
It also needs `APPLE_CLIENT_ID` for iOS and an independent `MOBILE_JWT_SECRET`.

## Google login on a phone

Expo Go is useful for previewing screens, but the native Google module cannot
run there. Use a development build for authentication testing:

1. In the **same Google Cloud project as the Web OAuth client**, create an
   Android OAuth client for package `com.toeicminitrainer.app` and the SHA-1
   fingerprint of the development APK. Obtain the EAS keystore SHA-1 with
   `npx eas-cli credentials -p android` (choose the development profile).
   A Play-distributed build can have a different signing SHA-1; register that
   separately before release.
2. Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `mobile/.env.local` to that
   project's Web OAuth client ID. The native Android flow requests an ID token
   for this Web client. The backend `GOOGLE_MOBILE_WEB_CLIENT_ID` must match it,
   or leave that variable unset to use the existing `GOOGLE_CLIENT_ID`.
   The Android OAuth client ID itself is not passed to native `configure()`;
   its package/SHA-1 registration authorizes the installed APK.
3. Set `EXPO_PUBLIC_API_URL` to an address the phone can reach. For local Android
   testing, use the computer's LAN address rather than `localhost`.
4. Configure a random backend-only `MOBILE_JWT_SECRET` of at least 32 characters.
   Never add it to an `EXPO_PUBLIC_*` variable.
5. Build and install a **new** development client after adding the native
   Google package, then start Metro for that client. Updating JavaScript alone
   does not add native modules to an APK already installed on the phone.

```bash
npx eas-cli build --platform android --profile development
npm run start:dev-client
```

Restart Metro with a cleared cache after changing public environment variables:

```bash
npx expo start --dev-client --clear
```

For an EAS cloud build, `.env.local` is not the release configuration. The
`development`, `preview`, and `production` profiles in `eas.json` select matching
EAS environments. Configure `EXPO_PUBLIC_API_URL` and
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` for each environment on expo.dev (or with
`npx eas-cli env:set`), then verify them before building. Public IDs and URLs
are embedded in the app; never put server secrets in `EXPO_PUBLIC_*` values.
Do not create a preview APK until its API URL is reachable over HTTPS from a
phone with the development computer turned off.

## Commands

```bash
npm install
npm run start
npm run start:dev-client
npm run android
npm run ios
npx tsc --noEmit
npx expo export --platform android
npx expo export --platform ios
```

iOS native builds require macOS or EAS Build. OAuth must be tested with the
standalone/development build identifiers before release.

## Session security

- Access tokens live in memory and expire after 15 minutes.
- Rotating refresh tokens are stored through Expo SecureStore using Android
  Keystore or iOS Keychain and are bound to a generated device ID.
- Refresh token reuse revokes the full session family server-side.
- The app bundle contains no private OAuth or AI secrets.

## Reviewed document imports (2026-10-01)

The Library screen now supports editing and approving/skipping each extracted
question before saving or contributing. Local drafts and recent ingestion jobs
can be reopened after restarting the app. Drafts are namespaced by API/account/job,
stored only on this device, and contain no tokens, secrets, signed URLs or sharing consent.
Wait for the saved-draft notice before closing the app.

Deploy the matching API before testing this client: job details must expose
`reviewProtocol: 1`. The new client blocks writes to older APIs; bodyless installed
APKs retain temporary compatibility on the new server. Changes for a contribution
after import do not edit the already-saved private question bank.

See [acceptance criteria and rollout checklist](../docs/MOBILE_QUESTION_REVIEW.md).
Native device acceptance is still required; source/bundle checks alone are not a release sign-off.
