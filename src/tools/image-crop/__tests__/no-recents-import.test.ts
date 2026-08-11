import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const imageCropDir = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE_FILES = ["manifest.ts", "crop.ts", "Tool.tsx"];

const IMPORT_SPECIFIER = /^\s*import\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gm;

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1]);
}

/**
 * Complements the synthetic-file ESLint boundary test in
 * src/lib/__tests__/eslint-boundaries.test.ts (which proves the
 * `no-restricted-imports` rule fires for a made-up image-crop file) by
 * scanning image-crop's *actual* real source files' import specifiers for
 * any reference to the generator-scoped recents module (spec: recents
 * domain — "No other tool, including image crop, MUST write to recents";
 * tasks 5.6). Checks only `import ... from "..."` specifiers, not prose —
 * these files' own doc comments legitimately name "recents"/
 * "password-generator" while documenting this exact boundary.
 */
describe("image-crop's real source files never import recents", () => {
  it.each(SOURCE_FILES)("%s has no import specifier naming recents or password-generator", (fileName) => {
    const contents = readFileSync(join(imageCropDir, fileName), "utf8");
    const specifiers = importSpecifiers(contents);

    for (const specifier of specifiers) {
      expect(specifier).not.toMatch(/recents/i);
      expect(specifier).not.toMatch(/password-generator/i);
    }
  });
});
