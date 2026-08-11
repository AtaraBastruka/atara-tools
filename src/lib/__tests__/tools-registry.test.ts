import { describe, expect, it, vi } from "vitest";
import type { ToolEntry } from "../types";

const passwordGeneratorModuleFactory = vi.hoisted(() => vi.fn(() => ({ default: () => null })));
const imageCropModuleFactory = vi.hoisted(() => vi.fn(() => ({ default: () => null })));
vi.mock("@/tools/password-generator/Tool", passwordGeneratorModuleFactory);
vi.mock("@/tools/image-crop/Tool", imageCropModuleFactory);

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

describe("registry lookups (PR5: image-crop registered alongside password-generator)", () => {
  it("has exactly the image-crop and password-generator entries", () => {
    expect(TOOLS).toHaveLength(2);
    expect(TOOLS.map((entry) => entry.manifest.slug)).toEqual([
      "image-crop",
      "password-generator",
    ]);
    expect(TOOLS.find((entry) => entry.manifest.slug === "image-crop")?.manifest.category).toBe(
      "image",
    );
    expect(
      TOOLS.find((entry) => entry.manifest.slug === "password-generator")?.manifest.category,
    ).toBe("security");
  });

  it("resolves each registered entry and the full slug list", () => {
    expect(getAllSlugs()).toEqual(["image-crop", "password-generator"]);
    expect(getToolBySlug("image-crop")?.manifest.slug).toBe("image-crop");
    expect(getToolBySlug("password-generator")?.manifest.slug).toBe("password-generator");
    expect(getToolBySlug("anything-else")).toBeUndefined();
  });

  it("surfaces both categories now that each holds one tool", () => {
    const groups = getCategoryGroups();

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.category)).toEqual(["image", "security"]);
    expect(groups.find((group) => group.category === "image")?.tools.map((e) => e.manifest.slug)).toEqual([
      "image-crop",
    ]);
    expect(
      groups.find((group) => group.category === "security")?.tools.map((e) => e.manifest.slug),
    ).toEqual(["password-generator"]);
  });

  it("exposes a component for each registered slug via getToolComponent", () => {
    expect(getToolComponent("image-crop")).toBeDefined();
    expect(getToolComponent("password-generator")).toBeDefined();
    expect(getToolComponent("anything-else")).toBeUndefined();
  });
});

describe("code-splitting: chunk stays unfetched until its load() is called", () => {
  it("never evaluates a tool's UI module merely by importing the registry", () => {
    // Importing this test file (and tools-registry.ts) above already ran
    // dynamic(entry.load) for every entry to build the component map — if
    // that eagerly executed the underlying import(), the mocked module
    // factories below would already have run by now.
    expect(passwordGeneratorModuleFactory).not.toHaveBeenCalled();
    expect(imageCropModuleFactory).not.toHaveBeenCalled();
  });

  it("only fetches a chunk once its own load() is explicitly invoked", async () => {
    const passwordGeneratorEntry = getToolBySlug("password-generator");
    const imageCropEntry = getToolBySlug("image-crop");
    expect(passwordGeneratorEntry).toBeDefined();
    expect(imageCropEntry).toBeDefined();

    await imageCropEntry?.load();

    expect(imageCropModuleFactory).toHaveBeenCalledTimes(1);
    // Fetching image-crop's chunk must not also fetch password-generator's.
    expect(passwordGeneratorModuleFactory).not.toHaveBeenCalled();

    await passwordGeneratorEntry?.load();

    expect(passwordGeneratorModuleFactory).toHaveBeenCalledTimes(1);
  });
});
