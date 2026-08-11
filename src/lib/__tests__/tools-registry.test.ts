import { describe, expect, it, vi } from "vitest";
import type { ToolEntry } from "../types";

const toolModuleFactory = vi.hoisted(() => vi.fn(() => ({ default: () => null })));
vi.mock("@/tools/password-generator/Tool", toolModuleFactory);

const {
  deriveCategoryGroups,
  getAllSlugs,
  getCategoryGroups,
  getToolBySlug,
  getToolComponent,
  TOOLS,
} = await import("../tools-registry");

function makeEntry(slug: string, category: "image" | "security"): ToolEntry {
  return {
    manifest: { slug, title: slug, description: `${slug} description`, category },
    load: () => Promise.resolve({ default: () => null }),
  };
}

describe("deriveCategoryGroups", () => {
  it("never renders a category with zero tools", () => {
    const groups = deriveCategoryGroups([makeEntry("secret-gen", "security")]);

    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("security");
    expect(groups.some((group) => group.category === "image")).toBe(false);
  });

  it("returns no groups for an empty registry", () => {
    expect(deriveCategoryGroups([])).toEqual([]);
  });

  it("groups multiple tools under their shared category, ordered by the display constant", () => {
    const groups = deriveCategoryGroups([
      makeEntry("password-generator", "security"),
      makeEntry("image-crop", "image"),
      makeEntry("another-security-tool", "security"),
    ]);

    expect(groups.map((group) => group.category)).toEqual(["image", "security"]);
    expect(groups.find((group) => group.category === "security")?.tools).toHaveLength(2);
  });
});

describe("registry lookups (PR3: password-generator registered)", () => {
  it("has exactly the password-generator entry", () => {
    expect(TOOLS).toHaveLength(1);
    expect(TOOLS[0].manifest.slug).toBe("password-generator");
    expect(TOOLS[0].manifest.category).toBe("security");
  });

  it("resolves the password-generator entry and slug list", () => {
    expect(getAllSlugs()).toEqual(["password-generator"]);
    expect(getToolBySlug("password-generator")?.manifest.slug).toBe("password-generator");
    expect(getToolBySlug("anything-else")).toBeUndefined();
  });

  it("surfaces the security category now that it holds one tool", () => {
    const groups = getCategoryGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("security");
    expect(groups[0].tools.map((entry) => entry.manifest.slug)).toEqual([
      "password-generator",
    ]);
    // image has zero registered tools in PR3, so it's absent by construction.
    expect(groups.some((group) => group.category === "image")).toBe(false);
  });

  it("exposes a component for the registered slug via getToolComponent", () => {
    expect(getToolComponent("password-generator")).toBeDefined();
    expect(getToolComponent("anything-else")).toBeUndefined();
  });
});

describe("code-splitting: chunk stays unfetched until its load() is called", () => {
  it("never evaluates the tool's UI module merely by importing the registry", () => {
    // Importing this test file (and tools-registry.ts) above already ran
    // dynamic(entry.load) to build the component map — if that eagerly
    // executed the underlying import(), the mocked module factory below
    // would already have run by now.
    expect(toolModuleFactory).not.toHaveBeenCalled();
  });

  it("only fetches the chunk once its load() is explicitly invoked", async () => {
    const entry = getToolBySlug("password-generator");
    expect(entry).toBeDefined();

    await entry?.load();

    expect(toolModuleFactory).toHaveBeenCalledTimes(1);
  });
});
