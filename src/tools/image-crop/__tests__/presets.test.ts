import { describe, expect, it } from "vitest";
import {
  CROP_ASPECT_PRESETS,
  CROP_SHAPE_PRESETS,
  isAspectPresetDisabled,
  resolveAspectRatio,
} from "../presets";

describe("CROP_ASPECT_PRESETS / CROP_SHAPE_PRESETS", () => {
  it("exposes exactly the locked preset set: free, 1:1, 4:3, 16:9, 9:16", () => {
    expect(CROP_ASPECT_PRESETS.map((preset) => preset.id)).toEqual([
      "free",
      "1:1",
      "4:3",
      "16:9",
      "9:16",
    ]);
  });

  it("gives 'free' a null ratio and every other preset a positive width/height ratio", () => {
    const byId = new Map(CROP_ASPECT_PRESETS.map((preset) => [preset.id, preset.ratio]));
    expect(byId.get("free")).toBeNull();
    expect(byId.get("1:1")).toBe(1);
    expect(byId.get("4:3")).toBeCloseTo(4 / 3);
    expect(byId.get("16:9")).toBeCloseTo(16 / 9);
    expect(byId.get("9:16")).toBeCloseTo(9 / 16);
  });

  it("exposes rectangle, rounded rectangle, and circle shapes", () => {
    expect(CROP_SHAPE_PRESETS.map((preset) => preset.id)).toEqual([
      "rectangle",
      "rounded-rectangle",
      "circle",
    ]);
  });
});

describe("resolveAspectRatio", () => {
  it("resolves a rectangle's aspect ratio straight from the matching preset", () => {
    expect(resolveAspectRatio("rectangle", "free")).toBeNull();
    expect(resolveAspectRatio("rectangle", "1:1")).toBe(1);
    expect(resolveAspectRatio("rectangle", "4:3")).toBeCloseTo(4 / 3);
    expect(resolveAspectRatio("rectangle", "16:9")).toBeCloseTo(16 / 9);
    expect(resolveAspectRatio("rectangle", "9:16")).toBeCloseTo(9 / 16);
  });

  it("forces 1:1 for circle regardless of the stored aspect id (locked decision #4)", () => {
    expect(resolveAspectRatio("circle", "free")).toBe(1);
    expect(resolveAspectRatio("circle", "4:3")).toBe(1);
    expect(resolveAspectRatio("circle", "16:9")).toBe(1);
    expect(resolveAspectRatio("circle", "9:16")).toBe(1);
    expect(resolveAspectRatio("circle", "1:1")).toBe(1);
  });
});

describe("isAspectPresetDisabled", () => {
  it("never disables any aspect preset for rectangle or rounded rectangle", () => {
    for (const preset of CROP_ASPECT_PRESETS) {
      expect(isAspectPresetDisabled("rectangle", preset.id)).toBe(false);
      expect(isAspectPresetDisabled("rounded-rectangle", preset.id)).toBe(false);
    }
  });

  it("resolves rounded rectangle aspect ratios like a plain rectangle", () => {
    expect(resolveAspectRatio("rounded-rectangle", "free")).toBeNull();
    expect(resolveAspectRatio("rounded-rectangle", "16:9")).toBeCloseTo(16 / 9);
  });

  it("disables every aspect preset except 1:1 for circle", () => {
    for (const preset of CROP_ASPECT_PRESETS) {
      expect(isAspectPresetDisabled("circle", preset.id)).toBe(preset.id !== "1:1");
    }
  });
});
