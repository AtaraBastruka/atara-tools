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
  ]),
  // Boundary (spec: recents domain — "No other tool, including image crop,
  // MUST write to recents"): every tool except password-generator must
  // never import the generator-scoped recents module.
  {
    files: ["src/tools/**/*.{ts,tsx}"],
    ignores: ["src/tools/password-generator/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/recents", "**/password-generator/*"],
              message:
                "Only password-generator may import recents — other tools have zero history (see spec: recents domain).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
