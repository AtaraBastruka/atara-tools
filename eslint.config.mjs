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
  // MUST write to recents"): image-crop must never import the
  // generator-scoped recents module, even once that tool folder exists.
  {
    files: ["src/tools/image-crop/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/recents", "**/password-generator/*"],
              message:
                "image-crop must never import password-generator/recents — image crop has zero history (see spec: recents domain).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
