import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "mobile/.expo/**",
    "mobile/dist/**",
    // Manual experiments and the Expo scaffold reset script are not app source.
    "Test/**",
    "mobile/scripts/reset-project.js",
  ]),
]);

export default eslintConfig;
