# TOEIC Mini Trainer Mobile

Expo SDK 57 / React Native client for Android and iOS. The Next.js application in
the repository root remains the API and web/admin application.

## Local configuration

1. Copy `.env.example` to `.env.local`.
2. Set `EXPO_PUBLIC_API_URL` to an HTTPS API URL. Plain HTTP is accepted only in
   a development bundle.
3. Add the platform Google OAuth client IDs. These IDs are public identifiers;
   never put client secrets, database credentials, AI keys, or JWT secrets in an
   `EXPO_PUBLIC_*` value.

The backend needs the matching `GOOGLE_ANDROID_CLIENT_ID`,
`GOOGLE_IOS_CLIENT_ID`, `APPLE_CLIENT_ID`, and an independent
`MOBILE_JWT_SECRET`.

## Commands

```bash
npm install
npm run start
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
