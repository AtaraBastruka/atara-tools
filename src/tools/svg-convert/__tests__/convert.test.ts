import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applySvgOutputSize,
  buildDownloadFileName,
  FALLBACK_INTRINSIC_SIZE,
  looksLikeSvg,
  MAX_OUTPUT_EDGE,
  mimeTypeForFormat,
  parseLength,
  parseSvgIntrinsicSize,
  parseViewBoxSize,
  rasterizeSvgToBlob,
  readSvgTextFromFile,
  resolveOutputSize,
  triggerDownload,
} from "../convert";

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>`;
const SIZED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><rect width="100" height="50"/></svg>`;

describe("looksLikeSvg", () => {
  it("accepts a bare <svg> document", () => {
    expect(looksLikeSvg(ICON_SVG)).toBe(true);
  });

  it("accepts an XML declaration and a BOM before the root", () => {
    expect(looksLikeSvg(`\uFEFF<?xml version="1.0"?>\n${ICON_SVG}`)).toBe(true);
  });

  it("rejects raster bytes and empty input", () => {
    expect(looksLikeSvg("")).toBe(false);
    expect(looksLikeSvg("<html><body></body></html>")).toBe(false);
    expect(looksLikeSvg("PNG")).toBe(false);
  });
});

describe("parseLength", () => {
  it("reads unitless and px values as CSS pixels", () => {
    expect(parseLength("24")).toBe(24);
    expect(parseLength("24px")).toBe(24);
  });

  it("converts common absolute units at 96dpi", () => {
    expect(parseLength("72pt")).toBe(96);
    expect(parseLength("1in")).toBe(96);
  });

  it("returns null for percentages, zero, and junk", () => {
    expect(parseLength("100%")).toBeNull();
    expect(parseLength("0")).toBeNull();
    expect(parseLength("auto")).toBeNull();
    expect(parseLength(null)).toBeNull();
  });
});

describe("parseViewBoxSize", () => {
  it("reads width and height from a space- or comma-separated viewBox", () => {
    expect(parseViewBoxSize("0 0 24 24")).toEqual({ width: 24, height: 24 });
    expect(parseViewBoxSize("0,0,100,50")).toEqual({ width: 100, height: 50 });
  });

  it("returns null for incomplete or non-positive viewBoxes", () => {
    expect(parseViewBoxSize("0 0 24")).toBeNull();
    expect(parseViewBoxSize("0 0 0 24")).toBeNull();
    expect(parseViewBoxSize(null)).toBeNull();
  });
});

describe("parseSvgIntrinsicSize", () => {
  it("prefers explicit width/height attributes over viewBox", () => {
    expect(parseSvgIntrinsicSize(SIZED_SVG)).toEqual({
      width: 100,
      height: 50,
      source: "attributes",
    });
  });

  it("falls back to viewBox when attributes are missing (typical icon SVG)", () => {
    expect(parseSvgIntrinsicSize(ICON_SVG)).toEqual({
      width: 24,
      height: 24,
      source: "viewBox",
    });
  });

  it("ignores percentage attributes and uses viewBox instead", () => {
    const svg = `<svg width="100%" height="100%" viewBox="0 0 32 16"></svg>`;
    expect(parseSvgIntrinsicSize(svg)).toEqual({
      width: 32,
      height: 16,
      source: "viewBox",
    });
  });

  it("derives the missing axis from viewBox when only one attribute is set", () => {
    const svg = `<svg width="48" viewBox="0 0 24 12"></svg>`;
    expect(parseSvgIntrinsicSize(svg)).toEqual({
      width: 48,
      height: 24,
      source: "attributes",
    });
  });

  it("uses the SVG spec default viewport when nothing is sized", () => {
    expect(parseSvgIntrinsicSize("<svg></svg>")).toEqual({
      ...FALLBACK_INTRINSIC_SIZE,
      source: "fallback",
    });
  });
});

describe("resolveOutputSize", () => {
  it("scales intrinsic pixels by the chosen multiplier", () => {
    expect(resolveOutputSize({ width: 24, height: 24 }, 4)).toEqual({ width: 96, height: 96 });
  });

  it("clamps the longest edge to MAX_OUTPUT_EDGE while keeping aspect ratio", () => {
    const size = resolveOutputSize({ width: 4000, height: 2000 }, 8);
    expect(size.width).toBe(MAX_OUTPUT_EDGE);
    expect(size.height).toBe(MAX_OUTPUT_EDGE / 2);
  });
});

describe("applySvgOutputSize", () => {
  it("inserts width and height when the root has neither", () => {
    const next = applySvgOutputSize(ICON_SVG, 96, 96);
    expect(next).toMatch(/<svg\b[^>]*\bwidth="96"/i);
    expect(next).toMatch(/<svg\b[^>]*\bheight="96"/i);
    expect(next).toContain('viewBox="0 0 24 24"');
  });

  it("replaces existing width and height attributes on the root only", () => {
    const next = applySvgOutputSize(SIZED_SVG, 200, 80);
    const openTag = next.match(/<svg\b[^>]*>/i)?.[0] ?? "";
    expect(openTag).toMatch(/width="200"/);
    expect(openTag).toMatch(/height="80"/);
    expect(openTag).not.toMatch(/width="100"/);
    expect(openTag).not.toMatch(/height="50"/);
    expect(next).toContain('<rect width="100" height="50"/>');
  });

  it("throws when there is no svg root", () => {
    expect(() => applySvgOutputSize("<div></div>", 10, 10)).toThrow(/no <svg> root/);
  });
});

describe("buildDownloadFileName / mimeTypeForFormat", () => {
  it("maps formats to mime types", () => {
    expect(mimeTypeForFormat("png")).toBe("image/png");
    expect(mimeTypeForFormat("webp")).toBe("image/webp");
  });

  it("replaces the original extension with the output format", () => {
    expect(buildDownloadFileName("logo.svg", "image/png")).toBe("logo.png");
    expect(buildDownloadFileName("logo.SVG", "image/webp")).toBe("logo.webp");
    expect(buildDownloadFileName(null, "image/png")).toBe("converted.png");
  });
});

describe("readSvgTextFromFile", () => {
  it("returns the file text when it looks like SVG", async () => {
    const file = new File([ICON_SVG], "icon.svg", { type: "image/svg+xml" });
    await expect(readSvgTextFromFile(file)).resolves.toBe(ICON_SVG);
  });

  it("rejects a non-SVG file even if the extension claims otherwise", async () => {
    const file = new File(["not-svg"], "icon.svg", { type: "image/svg+xml" });
    await expect(readSvgTextFromFile(file)).rejects.toThrow(/not an SVG/);
  });
});

describe("rasterizeSvgToBlob", () => {
  const drawImage = vi.fn();
  const getContext = vi.fn();
  const toBlob = vi.fn();

  beforeEach(() => {
    drawImage.mockReset();
    getContext.mockReset();
    toBlob.mockReset();
    getContext.mockReturnValue({ drawImage });
    toBlob.mockImplementation((callback: (blob: Blob | null) => void, type?: string) => {
      callback(new Blob(["raster"], { type }));
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(getContext);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(toBlob);

    const createObjectURL = vi.fn(() => "blob:svg-url");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      #src = "";
      get src() {
        return this.#src;
      }
      set src(value: string) {
        this.#src = value;
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("draws the decoded SVG onto a canvas sized to the output and extracts a PNG blob — no fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const blob = await rasterizeSvgToBlob(ICON_SVG, 96, 96, "image/png");

    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage.mock.calls[0][1]).toBe(0);
    expect(drawImage.mock.calls[0][2]).toBe(0);
    expect(drawImage.mock.calls[0][3]).toBe(96);
    expect(drawImage.mock.calls[0][4]).toBe(96);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png", undefined);
    expect(blob).toBeInstanceOf(Blob);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:svg-url");
  });

  it("passes a quality argument when encoding WebP", async () => {
    await rasterizeSvgToBlob(ICON_SVG, 48, 48, "image/webp");
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.92);
  });

  it("rejects when the canvas can't produce a 2D context", async () => {
    getContext.mockReturnValue(null);
    await expect(rasterizeSvgToBlob(ICON_SVG, 24, 24)).rejects.toThrow(/2D canvas context/);
  });

  it("rejects when toBlob yields a null blob", async () => {
    toBlob.mockImplementation((callback: (blob: Blob | null) => void) => callback(null));
    await expect(rasterizeSvgToBlob(ICON_SVG, 24, 24)).rejects.toThrow(/did not produce a blob/);
  });

  it("revokes the object URL and rejects when the SVG fails to decode", async () => {
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", FailingImage);

    await expect(rasterizeSvgToBlob(ICON_SVG, 24, 24)).rejects.toThrow(/could not be decoded/);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:svg-url");
  });
});

describe("triggerDownload", () => {
  it("creates an object URL, clicks a throwaway anchor with the right filename, and revokes the URL", () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const anchor = document.createElement("a");
    vi.spyOn(anchor, "click").mockImplementation(click);
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    triggerDownload(new Blob(["data"]), "logo.png");

    expect(createObjectURL).toHaveBeenCalled();
    expect(anchor.download).toBe("logo.png");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
