/**
 * Pure parse + canvas logic for svg-convert. Kept separate from Tool.tsx
 * so SVG sizing, filename, and the canvas/File-API calls are each testable
 * without simulating a real file picker or a real SVG decode.
 *
 * Everything stays client-side: the SVG is never sent over the network,
 * and nothing about the conversion is written to storage.
 */

export type OutputFormat = "png" | "webp";

export const OUTPUT_FORMATS: { id: OutputFormat; mimeType: string; label: string }[] = [
  { id: "png", mimeType: "image/png", label: "PNG" },
  { id: "webp", mimeType: "image/webp", label: "WebP" },
];

export const SCALE_PRESETS = [1, 2, 4, 8] as const;
export type ScalePreset = (typeof SCALE_PRESETS)[number];

export const DEFAULT_SCALE: ScalePreset = 2;
export const DEFAULT_FORMAT: OutputFormat = "png";

/** SVG spec default viewport when neither width/height nor viewBox is present. */
export const FALLBACK_INTRINSIC_SIZE = { width: 300, height: 150 } as const;

/** Longest canvas edge we will request — well under typical browser limits. */
export const MAX_OUTPUT_EDGE = 8192;

const WEBP_QUALITY = 0.92;

export interface SvgIntrinsicSize {
  width: number;
  height: number;
  source: "attributes" | "viewBox" | "fallback";
}

export interface OutputSize {
  width: number;
  height: number;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
};

export function mimeTypeForFormat(format: OutputFormat): string {
  return format === "webp" ? "image/webp" : "image/png";
}

export function looksLikeSvg(text: string): boolean {
  const trimmed = text.trim().replace(/^\uFEFF/, "");
  const withoutProlog = trimmed
    .replace(/^<\?xml\b[^?]*\?>\s*/i, "")
    .replace(/^<!--[\s\S]*?-->\s*/, "");
  return /<svg\b/i.test(withoutProlog);
}

export async function readSvgTextFromFile(file: File): Promise<string> {
  const text = await file.text();
  if (!looksLikeSvg(text)) {
    throw new Error("readSvgTextFromFile: the selected file is not an SVG");
  }
  return text;
}

function extractSvgOpenTag(svgText: string): string | null {
  const match = svgText.match(/<svg\b[^>]*>/i);
  return match ? match[0] : null;
}

function getAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match ? match[1] : null;
}

/**
 * Parses a CSS/SVG length into CSS pixels at 96dpi. Percentages and
 * unknown units return null so the caller can fall through to viewBox.
 */
export function parseLength(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) return null;
  const match = trimmed.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(px|pt|pc|in|cm|mm)?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (match[2] ?? "px").toLowerCase();
  if (unit === "px") return n;
  if (unit === "pt") return n * (96 / 72);
  if (unit === "pc") return n * 16;
  if (unit === "in") return n * 96;
  if (unit === "cm") return n * (96 / 2.54);
  if (unit === "mm") return n * (96 / 25.4);
  return n;
}

export function parseViewBoxSize(value: string | null): OutputSize | null {
  if (!value) return null;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4) return null;
  const width = parts[2];
  const height = parts[3];
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

/**
 * Prefers explicit width/height attributes (the intended display size)
 * over viewBox (the coordinate system). Percent-sized attributes are
 * ignored so a `width="100%"` icon still rasterizes from its viewBox.
 */
export function parseSvgIntrinsicSize(svgText: string): SvgIntrinsicSize {
  const tag = extractSvgOpenTag(svgText);
  if (!tag) return { ...FALLBACK_INTRINSIC_SIZE, source: "fallback" };

  const attrWidth = parseLength(getAttribute(tag, "width"));
  const attrHeight = parseLength(getAttribute(tag, "height"));
  if (attrWidth && attrHeight) {
    return { width: attrWidth, height: attrHeight, source: "attributes" };
  }

  const viewBox = parseViewBoxSize(getAttribute(tag, "viewBox"));
  if (viewBox) {
    if (attrWidth && !attrHeight) {
      return { width: attrWidth, height: attrWidth * (viewBox.height / viewBox.width), source: "attributes" };
    }
    if (attrHeight && !attrWidth) {
      return { width: attrHeight * (viewBox.width / viewBox.height), height: attrHeight, source: "attributes" };
    }
    return { ...viewBox, source: "viewBox" };
  }

  if (attrWidth) return { width: attrWidth, height: attrWidth, source: "attributes" };
  if (attrHeight) return { width: attrHeight, height: attrHeight, source: "attributes" };
  return { ...FALLBACK_INTRINSIC_SIZE, source: "fallback" };
}

export function resolveOutputSize(intrinsic: Pick<SvgIntrinsicSize, "width" | "height">, scale: number): OutputSize {
  const width = Math.max(1, Math.round(intrinsic.width * scale));
  const height = Math.max(1, Math.round(intrinsic.height * scale));
  const longest = Math.max(width, height);
  if (longest <= MAX_OUTPUT_EDGE) return { width, height };
  const factor = MAX_OUTPUT_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

function upsertAttribute(tag: string, name: string, value: string): string {
  const attr = new RegExp(`\\b${name}\\s*=\\s*(["']).*?\\1`, "i");
  if (attr.test(tag)) return tag.replace(attr, `${name}="${value}"`);
  return tag.replace(/\s*\/?>$/, ` ${name}="${value}"$&`);
}

/**
 * Rewrites the root `<svg>` so the browser decodes it at an explicit pixel
 * size — some engines ignore viewBox-only SVGs when drawing to canvas.
 */
export function applySvgOutputSize(svgText: string, width: number, height: number): string {
  const match = svgText.match(/<svg\b[^>]*>/i);
  if (!match || match.index === undefined) {
    throw new Error("applySvgOutputSize: no <svg> root element found");
  }
  let tag = match[0];
  tag = upsertAttribute(tag, "width", String(width));
  tag = upsertAttribute(tag, "height", String(height));
  return svgText.slice(0, match.index) + tag + svgText.slice(match.index + match[0].length);
}

export function buildDownloadFileName(originalName: string | null, mimeType: string): string {
  const extension = MIME_EXTENSIONS[mimeType] ?? "png";
  if (!originalName) return `converted.${extension}`;
  const dotIndex = originalName.lastIndexOf(".");
  const base = dotIndex > 0 ? originalName.slice(0, dotIndex) : originalName;
  return `${base}.${extension}`;
}

/**
 * Rasterizes SVG markup onto an in-memory canvas and extracts a PNG or
 * WebP blob. The sized SVG is loaded via an object URL — no network
 * request is ever made. The caller owns any preview URL derived from the
 * result; this function always revokes its own decode URL.
 */
export function rasterizeSvgToBlob(
  svgText: string,
  width: number,
  height: number,
  mimeType = "image/png",
): Promise<Blob> {
  const sized = applySvgOutputSize(svgText, width, height);
  const svgBlob = new Blob([sized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("rasterizeSvgToBlob: could not obtain a 2D canvas context"));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      const quality = mimeType === "image/webp" ? WEBP_QUALITY : undefined;
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("rasterizeSvgToBlob: canvas did not produce a blob"));
            return;
          }
          resolve(blob);
        },
        mimeType,
        quality,
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("rasterizeSvgToBlob: the SVG could not be decoded as an image"));
    };
    image.src = url;
  });
}

/**
 * Triggers a browser download of `blob` via a throwaway object URL and an
 * unattached anchor's `click()` — no `fetch`/`XMLHttpRequest`, no server
 * round-trip. The object URL is revoked immediately after the click.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
