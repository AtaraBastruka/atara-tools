/**
 * Pure geometry + canvas logic for image-crop (spec: image-crop domain —
 * client-side crop/download, no network, no history). Kept separate from
 * Tool.tsx so the drag math and the canvas/File-API calls are each testable
 * without simulating real pointer drags or real image decoding.
 *
 * PR5 scope is free (arbitrary-rectangle) crop only — no aspect/shape
 * presets and no circle mask (those are PR6; the rectangle path here is
 * documented in that phase's tasks as staying unchanged).
 */

export type CropHandle = "move" | "nw" | "ne" | "sw" | "se";

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
 * an edge. Each corner handle only ever moves its own two edges, clamped
 * against the fixed opposite edge (never swapped past it) so a handle
 * stops at the minimum size rather than flipping the box inside-out.
 */
export function applyCropDrag(box: CropBox, handle: CropHandle, dx: number, dy: number): CropBox {
  if (handle === "move") {
    const width = box.x2 - box.x1;
    const height = box.y2 - box.y1;
    const x1 = roundFraction(clamp(box.x1 + dx, 0, 1 - width));
    const y1 = roundFraction(clamp(box.y1 + dy, 0, 1 - height));
    return { x1, y1, x2: roundFraction(x1 + width), y2: roundFraction(y1 + height) };
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
 */
export function cropRegionToBlob(
  source: CanvasImageSource,
  region: CropRegion,
  mimeType = "image/png",
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

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("cropRegionToBlob: canvas did not produce a blob"));
        return;
      }
      resolve(blob);
    }, mimeType);
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
