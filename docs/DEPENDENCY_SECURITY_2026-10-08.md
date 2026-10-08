# Dependency release review — 08/10/2026

## Fixes selected

- Next.js and eslint-config-next: 16.3.5 → 16.3.8, remaining on the same minor release. This includes the fixes for the [Next.js ImageResponse RCE advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) and other advisories affecting versions before 16.3.8. The app does not currently import `next/og`; patching still removes the vulnerable dependency.
- Explicit lockfile overrides: sharp 0.35.5, source-map-js 1.2.2, mysql2 3.24.5, and mobile shell-quote 1.11.0. Shell-quote's [upstream advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) affects the build/development dependency path, not a demonstrated exploit in the APK.
- Deepmerge-ts 8.0.0: deliberate transitive major override, after reviewing [upstream breaking changes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0). Prisma config uses the retained `deepmerge` export on static records; this project's config uses no Maps, custom merge callbacks or deepmergeInto. Reverify Prisma generation, migration status, integration tests and production build. Do not downgrade Prisma to 6 merely to satisfy npm's automatic recommendation.
- Apply the patch versions recommended by `expo install --fix` within Expo SDK 57, and validate with `expo install --check`, TypeScript and Android export. The existing APK at source 24b9d6e remains a baseline preview, not the final beta artifact after dependency changes.

## Temporary tooling exceptions

The exceptions in `dependency-exceptions.json` expire on **22/10/2026** and are not a statement that the packages are fixed.

| Advisory | Context and restriction |
| --- | --- |
| [braces recursion DoS](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | No upstream patch as of this review. Web: ESLint globs from trusted repository config; every affected package must remain dev-only in package-lock. Mobile: Metro/Expo tooling; braces must be absent from the exported Android release source maps. Never pass request/upload data as glob patterns. |
| [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | No upstream patch as of this review. Used by Expo CLI/code-signing tooling; not used by native Google sign-in. OTA signing is not configured. Node-forge must be absent from the exported Android release source maps. Review separately before enabling OTA signing or changing the auth/build chain. |

These are development-path decisions based on the current import graph, not blanket acceptance of network-reachable vulnerabilities. Do not run development servers with untrusted configuration or expose them as the production service.

## Enforced gates

`npm run audit:dependencies -- --project web` and `--project mobile` fetch fresh npm audit evidence, block all critical and unreviewed high advisories, fail on registry errors, and reject expired exceptions. The web job additionally requires `npm audit --omit=dev --audit-level=high` to pass with no high/critical production dependency advisories.

Android CI exports with `--source-maps`, then runs `npm --prefix .. run check:mobile-bundle`. This checks actual exported sources for the unpatched tooling packages. It is evidence for the JavaScript release bundle, not a substitute for native/device QA or proof that a previously built APK has the new lockfile.

The policy tests cover transitive dependencies, legitimate npm dependency cycles, critical escalation, unknown advisories, expiry, invalid evidence and movement into production dependencies. CI branch protection and remote execution results still need verification on GitHub.

## Deployment payload

`.vercelignore` excludes local env/secrets, test assets/APKs, mobile/native folders and development output. Inspect `vercel deploy --dry --json` before upload; a deployment must not contain `.env`, Test, mobile or node_modules. Use the existing Vercel project and production env with `--skip-domain` for validation before promoting the canonical API URL. No database seed or migration is part of the build.
