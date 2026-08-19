import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const toolDir = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE_FILES = ["manifest.ts", "signature.ts", "render.ts", "Tool.tsx"];

const IMPORT_SPECIFIER = /^\s*import\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gm;

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1]);
}

describe("email-signature's real source files never import recents", () => {
  it.each(SOURCE_FILES)("%s has no import specifier naming recents or password-generator", (fileName) => {
    const contents = readFileSync(join(toolDir, fileName), "utf8");
    const specifiers = importSpecifiers(contents);

    for (const specifier of specifiers) {
      expect(specifier).not.toMatch(/recents/i);
      expect(specifier).not.toMatch(/password-generator/i);
    }
  });
});
