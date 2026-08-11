/**
 * Static catalog of crop aspect-ratio and shape presets (spec/tasks PR6:
 * "Image Crop — Shape & Aspect Presets", locked decision #4). Pure data plus
 * two small resolvers — no geometry math or canvas logic lives here, that
 * stays in crop.ts. `crop.ts` imports only the plain `CropShapePresetId`
 * union from this module (for its circle-mask branch); it never imports the
 * preset tables themselves, so the geometry/canvas layer stays
 * preset-agnostic and Tool.tsx is the only place that resolves an id to a
 * ratio.
 */

export type CropAspectPresetId = "free" | "1:1" | "4:3" | "16:9" | "9:16";
export type CropShapePresetId = "rectangle" | "rounded-rectangle" | "circle";

/** Corner radius as a fraction of the shorter crop-box side (export + overlay). */
export const ROUNDED_RECT_CORNER_FRACTION = 0.12;

export function roundedRectCornerRadius(width: number, height: number): number {
  return Math.min(width, height) * ROUNDED_RECT_CORNER_FRACTION;
}

/** Shapes that clip with transparency require PNG output. */
export function shapeRequiresPngOutput(shape: CropShapePresetId): boolean {
  return shape === "circle" || shape === "rounded-rectangle";
}

export interface CropAspectPreset {
  id: CropAspectPresetId;
  label: string;
  /** width / height, or null for an unconstrained ("free") crop. */
  ratio: number | null;
}

export interface CropShapePreset {
  id: CropShapePresetId;
  label: string;
}

export const CROP_ASPECT_PRESETS: CropAspectPreset[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "1:1", label: "1:1 (square)", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];

export const CROP_SHAPE_PRESETS: CropShapePreset[] = [
  { id: "rectangle", label: "Rectangle" },
  { id: "rounded-rectangle", label: "Rounded rectangle" },
  { id: "circle", label: "Circle" },
];

// Locked decision: circle forces 1:1 and disables every other aspect choice.
const CIRCLE_ASPECT_RATIO = 1;

/**
 * Resolves the numeric aspect ratio (or `null` for unconstrained) that the
 * current shape+aspect selection implies. Circle always wins over whatever
 * aspect id is stored, so callers never need to special-case it themselves.
 */
export function resolveAspectRatio(
  shape: CropShapePresetId,
  aspectId: CropAspectPresetId,
): number | null {
  if (shape === "circle") return CIRCLE_ASPECT_RATIO;
  return CROP_ASPECT_PRESETS.find((preset) => preset.id === aspectId)?.ratio ?? null;
}

/** True when the given aspect preset can't be chosen because circle forces 1:1. */
export function isAspectPresetDisabled(
  shape: CropShapePresetId,
  aspectId: CropAspectPresetId,
): boolean {
  return shape === "circle" && aspectId !== "1:1";
}
