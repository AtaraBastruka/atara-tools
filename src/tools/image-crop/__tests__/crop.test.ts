import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyCropDrag,
  buildDownloadFileName,
  cropBoxToRegion,
  cropRegionToBlob,
  DEFAULT_CROP_BOX,
  loadImageFromFile,
  MIN_CROP_FRACTION,
  resolveCropMimeType,
  triggerDownload,
  type CropBox,
} from "../crop";

describe("applyCropDrag", () => {
  const box: CropBox = { x1: 0.2, y1: 0.2, x2: 0.6, y2: 0.5 };

  it("translates the whole box on 'move' without changing its size", () => {
    const next = applyCropDrag(box, "move", 0.1, -0.05);

    expect(next.x2 - next.x1).toBeCloseTo(box.x2 - box.x1);
    expect(next.y2 - next.y1).toBeCloseTo(box.y2 - box.y1);
    expect(next.x1).toBeCloseTo(0.3);
    expect(next.y1).toBeCloseTo(0.15);
  });

  it("clamps a 'move' translation at the image edge instead of shrinking the box", () => {
    const next = applyCropDrag(box, "move", 10, 10);

    expect(next.x2).toBeCloseTo(1);
    expect(next.y2).toBeCloseTo(1);
    expect(next.x2 - next.x1).toBeCloseTo(box.x2 - box.x1);
    expect(next.y2 - next.y1).toBeCloseTo(box.y2 - box.y1);
  });

  it("resizes only the two edges owned by each corner handle", () => {
    const nw = applyCropDrag(box, "nw", 0.05, 0.05);
    expect(nw.x1).toBeCloseTo(0.25);
    expect(nw.y1).toBeCloseTo(0.25);
    expect(nw.x2).toBe(box.x2);
    expect(nw.y2).toBe(box.y2);

    const se = applyCropDrag(box, "se", -0.05, 0.05);
    expect(se.x2).toBeCloseTo(0.55);
    expect(se.y2).toBeCloseTo(0.55);
    expect(se.x1).toBe(box.x1);
    expect(se.y1).toBe(box.y1);
  });

  it("stops a corner handle at the minimum size rather than flipping the box inside-out", () => {
    const next = applyCropDrag(box, "se", -10, -10);

    expect(next.x2 - next.x1).toBeCloseTo(MIN_CROP_FRACTION);
    expect(next.y2 - next.y1).toBeCloseTo(MIN_CROP_FRACTION);
    expect(next.x2).toBeGreaterThan(next.x1);
    expect(next.y2).toBeGreaterThan(next.y1);
  });

  it("clamps every edge within [0, 1]", () => {
    const next = applyCropDrag(DEFAULT_CROP_BOX, "nw", -10, -10);

    expect(next.x1).toBe(0);
    expect(next.y1).toBe(0);
  });
});

describe("cropBoxToRegion", () => {
  it("converts a fractional box into rounded natural-pixel coordinates", () => {
    const region = cropBoxToRegion({ x1: 0.25, y1: 0.5, x2: 0.75, y2: 1 }, 400, 200);

    expect(region).toEqual({ x: 100, y: 100, width: 200, height: 100 });
  });

  it("never returns a zero-size region even for a degenerate box", () => {
    const region = cropBoxToRegion({ x1: 0.5, y1: 0.5, x2: 0.5, y2: 0.5 }, 100, 100);

    expect(region.width).toBeGreaterThanOrEqual(1);
    expect(region.height).toBeGreaterThanOrEqual(1);
  });
});

describe("resolveCropMimeType", () => {
  it("keeps a supported original format", () => {
    expect(resolveCropMimeType("image/jpeg")).toBe("image/jpeg");
    expect(resolveCropMimeType("image/webp")).toBe("image/webp");
    expect(resolveCropMimeType("image/png")).toBe("image/png");
  });

  it("falls back to PNG for an unsupported or unknown type", () => {
    expect(resolveCropMimeType("image/svg+xml")).toBe("image/png");
    expect(resolveCropMimeType("")).toBe("image/png");
  });
});

describe("buildDownloadFileName", () => {
  it("appends -cropped and the extension for the resolved mime type, keeping the base name", () => {
    expect(buildDownloadFileName("vacation.jpg", "image/jpeg")).toBe("vacation-cropped.jpg");
    expect(buildDownloadFileName("logo.png", "image/png")).toBe("logo-cropped.png");
    expect(buildDownloadFileName("no-extension", "image/png")).toBe("no-extension-cropped.png");
  });

  it("falls back to a generic name when no original file name is known", () => {
    expect(buildDownloadFileName(null, "image/webp")).toBe("cropped-image.webp");
  });
});

describe("cropRegionToBlob", () => {
  let drawImage: ReturnType<typeof vi.fn>;
  let toBlob: ReturnType<typeof vi.fn>;
  let getContext: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    drawImage = vi.fn();
    // jsdom implements HTMLCanvasElement.getContext()/toBlob() as no-ops
    // that log "Not implemented" without installing the optional `canvas`
    // npm package, so both are mocked directly rather than relying on a
    // real 2D context.
    getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    toBlob = vi.fn((callback: (blob: Blob | null) => void, type?: string) => {
      callback(new Blob(["crop"], { type: type ?? "image/png" }));
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      toBlob as unknown as HTMLCanvasElement["toBlob"],
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sizes the canvas to the region and draws only that source rectangle onto it at (0, 0)", async () => {
    const source = {} as CanvasImageSource;
    const region = { x: 10, y: 20, width: 100, height: 50 };

    const blob = await cropRegionToBlob(source, region, "image/jpeg");

    expect(getContext).toHaveBeenCalledWith("2d");
    expect(drawImage).toHaveBeenCalledWith(source, 10, 20, 100, 50, 0, 0, 100, 50);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg");
    expect(blob).toBeInstanceOf(Blob);
  });

  it("rejects when the canvas can't produce a 2D context", async () => {
    getContext.mockReturnValue(null);

    await expect(
      cropRegionToBlob({} as CanvasImageSource, { x: 0, y: 0, width: 10, height: 10 }),
    ).rejects.toThrow(/2D canvas context/);
  });

  it("rejects when toBlob yields a null blob", async () => {
    toBlob.mockImplementation((callback: (blob: Blob | null) => void) => callback(null));

    await expect(
      cropRegionToBlob({} as CanvasImageSource, { x: 0, y: 0, width: 10, height: 10 }),
    ).rejects.toThrow(/did not produce a blob/);
  });
});

describe("triggerDownload", () => {
  it("creates an object URL, clicks a throwaway anchor with the right filename, and revokes the URL", () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    // jsdom doesn't implement URL.createObjectURL/revokeObjectURL at all
    // (unlike getContext/toBlob, these aren't even present as no-op stubs).
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const anchor = document.createElement("a");
    vi.spyOn(anchor, "click").mockImplementation(click);
    vi.spyOn(document, "createElement").mockReturnValue(anchor);

    const blob = new Blob(["data"]);
    triggerDownload(blob, "cropped-image.png");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.href).toBe("blob:mock-url");
    expect(anchor.download).toBe("cropped-image.png");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

describe("loadImageFromFile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates an object URL and resolves with the decoded image once it loads — no network request", async () => {
    const createObjectURL = vi.fn(() => "blob:mock-image-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 300;
      naturalHeight = 150;
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
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const file = new File(["bytes"], "photo.png", { type: "image/png" });
    const { image, url } = await loadImageFromFile(file);

    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(url).toBe("blob:mock-image-url");
    expect(image.naturalWidth).toBe(300);
    expect(image.naturalHeight).toBe(150);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("revokes the object URL and rejects when the image fails to decode", async () => {
    const createObjectURL = vi.fn(() => "blob:bad-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", FailingImage);

    const file = new File(["not-an-image"], "broken.txt", { type: "text/plain" });

    await expect(loadImageFromFile(file)).rejects.toThrow(/could not be decoded/);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:bad-url");
  });
});
