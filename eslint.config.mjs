import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "next-env.d.ts",
    ".omx/**",
    "test-results/**",
    "playwright-report/**",
    "src-tauri/target/**",
    "src-tauri/gen/**",
  ]),
]);
