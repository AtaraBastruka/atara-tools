import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const RECENTS_IMPORT = `import { recentsStore } from "@/tools/password-generator/recents";
export const usage = recentsStore;
`;

/**
 * Enforces the recents domain's isolation boundary (spec: "No other tool,
 * including image crop, MUST write to recents") at lint time, not just by
 * convention — even though src/tools/image-crop/ doesn't exist until a
 * later PR, ESLint's flat-config `files` glob still applies once it does.
 */
describe("image-crop must never import recents (spec: recents domain)", () => {
  // Spinning up a real ESLint instance (flat config + eslint-config-next)
  // occasionally exceeds the default 5000ms timeout on a cold/loaded
  // machine even though the lint call itself is fast once ESLint's config
  // resolution has warmed up — bumped for this test only rather than
  // loosening the global testTimeout.
  it(
    "flags an import of the password-generator recents module from an image-crop file",
    async () => {
      const eslint = new ESLint({ cwd: process.cwd() });
      const [result] = await eslint.lintText(RECENTS_IMPORT, {
        filePath: "src/tools/image-crop/Tool.tsx",
      });

      const restrictedImportMessages = result.messages.filter(
        (message) => message.ruleId === "no-restricted-imports",
      );
      expect(restrictedImportMessages.length).toBeGreaterThan(0);
    },
    15000,
  );

  it("does not flag the same import pattern for files outside image-crop", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const [result] = await eslint.lintText(RECENTS_IMPORT, {
      filePath: "src/tools/password-generator/other.ts",
    });

    const restrictedImportMessages = result.messages.filter(
      (message) => message.ruleId === "no-restricted-imports",
    );
    expect(restrictedImportMessages.length).toBe(0);
  });
});
