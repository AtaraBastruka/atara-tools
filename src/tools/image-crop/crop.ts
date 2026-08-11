/**
 * Pure geometry + canvas logic for image-crop (spec: image-crop domain —
 * client-side crop/download, no network, no history). Kept separate from
 * Tool.tsx so the drag math and the canvas/File-API calls are each testable
 * without simulating real pointer drags or real image decoding.
 *
 * PR5 added free (arbitrary-rectangle) crop. PR6 (this revision) adds an
 * optional aspect-ratio lock to the same drag math (`applyCropDrag`'s new
 * `aspectRatio` parameter, plus `constrainBoxToAspect` for
 * preset-selection-time reshaping) and an optional circular alpha mask in
 * `cropRegionToBlob` — the rectangle path through both functions is
 * unchanged when no ratio/shape is passed, per tasks 6.4's "rectangle path
 * unchanged". Preset *tables* (ids/labels) live in ./presets, not here —
 * this module only ever sees plain numbers/ids it's told to apply.
 */

import {
  roundedRectCornerRadius,
  shapeRequiresPngOutput,
  type CropShapePresetId,
} from "./presets";

export type CropHandle = "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

/** Fractions of the image's natural size, in [0, 1], with x1 < x2 and y1 < y2. */
export interface CropBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A crop region in the source image's natural pixel space. */
export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_CROP_BOX: CropBox = { x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9 };

// Minimum box width/height, as a fraction of the image's natural size —
// prevents a drag from collapsing the crop to a degenerate 0-size region.
export const MIN_CROP_FRACTION = 0.05;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Rounds away binary floating-point noise (e.g. 1 - (0.9 - 0.1) is
// 0.19999999999999998, not 0.2) so a drag that should land a box edge
// exactly on a clean fraction does, instead of being clamped a
// hair short of it. A millionth of the image's size is far below a single
// pixel even for a very large image, so this never affects where a crop
// visibly lands.
const FRACTION_PRECISION = 1_000_000;
function roundFraction(value: number): number {
  return Math.round(value * FRACTION_PRECISION) / FRACTION_PRECISION;
}

/**
 * Applies one drag step to a crop box. `dx`/`dy` are deltas in the same
 * [0, 1] fractional space as the box itself — Tool.tsx converts pointer-
 * pixel movement into that space once per pointer-move event (dividing by
 * the rendered image's bounding-rect size), so this function never touches
 * the DOM and is trivial to unit test directly.
 *
 * "move" translates the whole box, clamping the *translation* against the
 * image bounds so the box keeps its size instead of shrinking when it hits
 * an edge — unaffected by `aspectRatio`, since translation never changes
 * the box's size. Each corner handle only ever moves its own two edges,
 * clamped against the fixed opposite edge (never swapped past it) so a
 * handle stops at the minimum size rather than flipping the box
 * inside-out.
 *
 * `aspectRatio` (width / height) is optional and defaults to `null` (free
 * resize, PR5's original behavior, unchanged). When set (PR6: aspect/shape
 * presets), corner resizing is delegated to `resizeWithLockedAspect` so the
 * box's width/height ratio always equals `aspectRatio` after the drag,
 * regardless of whether the pointer moved mostly horizontally or
 * vertically.
 */
export function applyCropDrag(
  box: CropBox,
  handle: CropHandle,
  dx: number,
  dy: number,
  aspectRatio: number | null = null,
): CropBox {
  if (handle === "move") {
    const width = box.x2 - box.x1;
    const height = box.y2 - box.y1;
    const x1 = roundFraction(clamp(box.x1 + dx, 0, 1 - width));
    const y1 = roundFraction(clamp(box.y1 + dy, 0, 1 - height));
    return { x1, y1, x2: roundFraction(x1 + width), y2: roundFraction(y1 + height) };
  }

  if (aspectRatio) return resizeWithLockedAspect(box, handle, dx, dy, aspectRatio);

  if (handle === "n") {
    const y1 = Math.min(clamp(box.y1 + dy, 0, 1), box.y2 - MIN_CROP_FRACTION);
    return { ...box, y1: roundFraction(y1) };
  }
  if (handle === "s") {
    const y2 = Math.max(clamp(box.y2 + dy, 0, 1), box.y1 + MIN_CROP_FRACTION);
    return { ...box, y2: roundFraction(y2) };
  }
  if (handle === "e") {
    const x2 = Math.max(clamp(box.x2 + dx, 0, 1), box.x1 + MIN_CROP_FRACTION);
    return { ...box, x2: roundFraction(x2) };
  }
  if (handle === "w") {
    const x1 = Math.min(clamp(box.x1 + dx, 0, 1), box.x2 - MIN_CROP_FRACTION);
    return { ...box, x1: roundFraction(x1) };
  }

  let { x1, y1, x2, y2 } = box;
  if (handle === "nw" || handle === "sw") x1 = clamp(box.x1 + dx, 0, 1);
  if (handle === "ne" || handle === "se") x2 = clamp(box.x2 + dx, 0, 1);
  if (handle === "nw" || handle === "ne") y1 = clamp(box.y1 + dy, 0, 1);
  if (handle === "sw" || handle === "se") y2 = clamp(box.y2 + dy, 0, 1);

  if (handle === "nw" || handle === "sw") x1 = Math.min(x1, x2 - MIN_CROP_FRACTION);
  if (handle === "ne" || handle === "se") x2 = Math.max(x2, x1 + MIN_CROP_FRACTION);
  if (handle === "nw" || handle === "ne") y1 = Math.min(y1, y2 - MIN_CROP_FRACTION);
  if (handle === "sw" || handle === "se") y2 = Math.max(y2, y1 + MIN_CROP_FRACTION);

  return { x1: roundFraction(x1), y1: roundFraction(y1), x2: roundFraction(x2), y2: roundFraction(y2) };
}

/**
 * Resizes a corner-handle drag while keeping the box's opposite corner
 * fixed as the anchor and its width/height ratio locked to `aspectRatio`.
 * Picks whichever of `dx`/`dy` implies the larger size change (converting
 * the vertical delta into its width-equivalent via `aspectRatio` first) as
 * the driving dimension, then derives the other dimension from the ratio —
 * so a drag that's mostly vertical still resizes the box correctly instead
 * of being ignored. Falls back to shrinking the driving dimension (and
 * re-deriving the other from it) if the ratio-derived size would overflow
 * the image bounds on the non-driving axis, which keeps the exact ratio
 * even in that clamp case.
 */
function resizeWithLockedAspect(
  box: CropBox,
  handle: Exclude<CropHandle, "move">,
  dx: number,
  dy: number,
  aspectRatio: number,
): CropBox {
  const anchorOnRight = handle === "nw" || handle === "sw";
  const anchorOnBottom = handle === "nw" || handle === "ne";
  const anchorX = anchorOnRight ? box.x2 : box.x1;
  const anchorY = anchorOnBottom ? box.y2 : box.y1;

  const widthSign = handle === "ne" || handle === "se" ? 1 : -1;
  const heightSign = handle === "sw" || handle === "se" ? 1 : -1;
  const widthDelta = widthSign * dx;
  const heightDelta = heightSign * dy;

  const maxWidth = anchorOnRight ? anchorX : 1 - anchorX;
  const maxHeight = anchorOnBottom ? anchorY : 1 - anchorY;

  const currentWidth = box.x2 - box.x1;
  const useWidthAsDriver = Math.abs(widthDelta) >= Math.abs(heightDelta * aspectRatio);
  let width = useWidthAsDriver
    ? clamp(currentWidth + widthDelta, MIN_CROP_FRACTION, maxWidth)
    : clamp((box.y2 - box.y1 + heightDelta) * aspectRatio, MIN_CROP_FRACTION, maxWidth);
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = clamp(height * aspectRatio, MIN_CROP_FRACTION, maxWidth);
    height = width / aspectRatio;
  }

  const x1 = anchorOnRight ? anchorX - width : anchorX;
  const y1 = anchorOnBottom ? anchorY - height : anchorY;
  return {
    x1: roundFraction(x1),
    y1: roundFraction(y1),
    x2: roundFraction(x1 + width),
    y2: roundFraction(y1 + height),
  };
}

/**
 * Reshapes an existing box to match `aspectRatio`, anchored at its current
 * top-left corner (`x1`/`y1` unchanged) — used when a preset selection
 * changes (PR6), not during a drag. Passing `null` (the "free" preset)
 * returns `box` unchanged, since there's no ratio to constrain to.
 */
export function constrainBoxToAspect(box: CropBox, aspectRatio: number | null): CropBox {
  if (!aspectRatio) return box;

  const maxWidth = 1 - box.x1;
  const maxHeight = 1 - box.y1;
  let width = clamp(box.x2 - box.x1, MIN_CROP_FRACTION, maxWidth);
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = clamp(height * aspectRatio, MIN_CROP_FRACTION, maxWidth);
    height = width / aspectRatio;
  }

  return {
    x1: roundFraction(box.x1),
    y1: roundFraction(box.y1),
    x2: roundFraction(box.x1 + width),
    y2: roundFraction(box.y1 + height),
  };
}

/** Converts a fractional crop box into whole pixels in the image's natural space. */
export function cropBoxToRegion(box: CropBox, naturalWidth: number, naturalHeight: number): CropRegion {
  const x = Math.round(box.x1 * naturalWidth);
  const y = Math.round(box.y1 * naturalHeight);
  const width = Math.max(1, Math.round((box.x2 - box.x1) * naturalWidth));
  const height = Math.max(1, Math.round((box.y2 - box.y1) * naturalHeight));
  return { x, y, width, height };
}

const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Keeps the original file's format for a rectangle crop when it's one we can re-encode; otherwise falls back to PNG. */
export function resolveCropMimeType(fileType: string): string {
  return SUPPORTED_MIME_TYPES.has(fileType) ? fileType : "image/png";
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function buildDownloadFileName(originalName: string | null, mimeType: string): string {
  const extension = MIME_EXTENSIONS[mimeType] ?? "png";
  if (!originalName) return `cropped-image.${extension}`;
  const dotIndex = originalName.lastIndexOf(".");
  const base = dotIndex > 0 ? originalName.slice(0, dotIndex) : originalName;
  return `${base}-cropped.${extension}`;
}

/**
 * Decodes a local file into an `<img>` element entirely client-side via an
 * object URL — no network request is ever made (spec: image-crop domain,
 * "no image bytes over the network"). The caller owns the returned URL and
 * is responsible for revoking it once the image is no longer displayed
 * (Tool.tsx revokes the previous URL when a new file is chosen, and on
 * unmount); on a decode error, the URL is revoked here since the caller
 * never receives it.
 */
export function loadImageFromFile(file: File): Promise<{ image: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("loadImageFromFile: the selected file could not be decoded as an image"));
    };
    image.src = url;
  });
}

/**
 * Draws the given region of `source` onto an in-memory canvas sized to
 * exactly that region, then extracts it via `toBlob` — no `toDataURL`, no
 * upload, nothing written anywhere else. This is the only place image
 * pixels are read; the canvas is never attached to the document.
 *
 * `shape` defaults to `"rectangle"`, which is byte-for-byte the PR5
 * behavior (no clip call at all, `mimeType` used exactly as passed) — per
 * tasks 6.4's "rectangle path unchanged". When `shape` is `"circle"`, an
 * elliptical clip inscribed in the region is applied before `drawImage`, so
 * every pixel outside it stays transparent on the canvas's fresh (fully
 * transparent) backing store; the output is then forced to `image/png`
 * regardless of `mimeType`, since only PNG among this module's supported
 * formats can carry that transparency (task 6.6).
 */
export function cropRegionToBlob(
  source: CanvasImageSource,
  region: CropRegion,
  mimeType = "image/png",
  shape: CropShapePresetId = "rectangle",
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = region.width;
    canvas.height = region.height;

    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("cropRegionToBlob: could not obtain a 2D canvas context"));
      return;
    }

    let clipped = false;
    if (shape === "circle") {
      const radiusX = region.width / 2;
      const radiusY = region.height / 2;
      context.save();
      context.beginPath();
      context.ellipse(radiusX, radiusY, radiusX, radiusY, 0, 0, Math.PI * 2);
      context.closePath();
      context.clip();
      clipped = true;
    } else if (shape === "rounded-rectangle") {
      const radius = roundedRectCornerRadius(region.width, region.height);
      context.save();
      context.beginPath();
      context.roundRect(0, 0, region.width, region.height, radius);
      context.closePath();
      context.clip();
      clipped = true;
    }

    context.drawImage(
      source,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      region.width,
      region.height,
    );

    if (clipped) context.restore();

    const outputMimeType = shapeRequiresPngOutput(shape) ? "image/png" : mimeType;
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("cropRegionToBlob: canvas did not produce a blob"));
        return;
      }
      resolve(blob);
    }, outputMimeType);
  });
}

/**
 * Triggers a browser download of `blob` via a throwaway object URL and an
 * unattached anchor's `click()` — no `fetch`/`XMLHttpRequest`, no server
 * round-trip. The object URL is revoked immediately after the click; if the
 * user never confirms this download, nothing about the crop persists
 * anywhere (spec: image-crop domain, "No History or Recents").
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
