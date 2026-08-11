import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImageCropTool from "../Tool";

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 400;
  naturalHeight = 200;
  #src = "";
  get src() {
    return this.#src;
  }
  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => this.onload?.());
  }
}

function mockObjectUrl() {
  // Patches the two static methods directly onto the real `URL`
  // constructor (jsdom doesn't implement either, so there's nothing to
  // `vi.spyOn` — the property is absent, not just falsy) rather than
  // replacing the global with a plain object: a full
  // `vi.stubGlobal("URL", {...})` replacement breaks anything that does
  // `new URL(...)` later in the same test file, including across a
  // `vi.resetModules()` + dynamic re-import.
  const createObjectURL = vi.fn(() => "blob:mock-url");
  const revokeObjectURL = vi.fn();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  return { createObjectURL, revokeObjectURL };
}

function mockCanvasForCrop() {
  const drawImage = vi.fn();
  const save = vi.fn();
  const restore = vi.fn();
  const beginPath = vi.fn();
  const ellipse = vi.fn();
  const closePath = vi.fn();
  const clip = vi.fn();
  const roundRect = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
    save,
    restore,
    beginPath,
    ellipse,
    closePath,
    clip,
    roundRect,
  } as unknown as CanvasRenderingContext2D);
  let lastMimeType: string | undefined;
  const toBlob = vi.fn((callback: (blob: Blob | null) => void, type?: string) => {
    lastMimeType = type;
    callback(new Blob(["crop"], { type }));
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    toBlob as unknown as HTMLCanvasElement["toBlob"],
  );
  return { drawImage, save, restore, ellipse, clip, toBlob, getLastMimeType: () => lastMimeType };
}

function mockAnchorClick() {
  const click = vi.fn();
  const realCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
    const element = realCreateElement(tagName);
    if (tagName === "a") vi.spyOn(element as HTMLAnchorElement, "click").mockImplementation(click);
    return element;
  });
  return click;
}

async function selectImageFile() {
  const input = screen.getByLabelText("Choose image file") as HTMLInputElement;
  const file = new File(["fake-image-bytes"], "photo.png", { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Download crop" })).toBeInTheDocument();
  });
  return file;
}

describe("ImageCropTool", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders a file input and no crop UI before an image is chosen", () => {
    render(<ImageCropTool />);

    expect(screen.getByRole("button", { name: "Choose image" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download crop" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Crop region" })).not.toBeInTheDocument();
  });

  it("shows the free-crop overlay and Download button once an image is selected", async () => {
    mockObjectUrl();
    render(<ImageCropTool />);

    await selectImageFile();

    const group = screen.getByRole("group", { name: "Crop region" });
    expect(group).toBeInTheDocument();
    // Free crop starts at the default 10%-inset box, not a fixed aspect ratio.
    expect(group.style.left).toBe("10%");
    expect(group.style.top).toBe("10%");
    expect(group.style.width).toBe("80%");
    expect(group.style.height).toBe("80%");
    expect(screen.getAllByRole("button", { name: /^Resize crop from/ })).toHaveLength(8);
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });

  it("dragging the move handle repositions the crop region (free rectangle, not a preset)", async () => {
    mockObjectUrl();
    render(<ImageCropTool />);
    await selectImageFile();

    vi.spyOn(HTMLImageElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 100,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const group = screen.getByRole("group", { name: "Crop region" });
    fireEvent.pointerDown(group, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(group, { clientX: 20, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(group, { clientX: 20, clientY: 10, pointerId: 1 });

    await waitFor(() => {
      // dx = 20/200 = 0.1 -> x1 0.1+0.1=0.2 (20%); dy = 10/100 = 0.1 -> y1 0.2 (20%).
      expect(group.style.left).toBe("20%");
      expect(group.style.top).toBe("20%");
    });
    // Moving must not resize the box.
    expect(group.style.width).toBe("80%");
    expect(group.style.height).toBe("80%");
  });

  it("downloads the cropped result and makes no network request (spec: image-crop domain)", async () => {
    mockObjectUrl();
    mockCanvasForCrop();
    const click = mockAnchorClick();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<ImageCropTool />);
    await selectImageFile();

    fireEvent.click(screen.getByRole("button", { name: "Download crop" }));

    await waitFor(() => {
      expect(screen.getByText("Downloaded.")).toBeInTheDocument();
    });
    expect(click).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never writes to localStorage or sessionStorage, and a reload leaves no trace of an undownloaded crop", async () => {
    mockObjectUrl();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { unmount } = render(<ImageCropTool />);

    await selectImageFile();
    // Deliberately do not click Download — this crop is now unrecoverable.
    expect(setItem).not.toHaveBeenCalled();

    unmount();
    vi.resetModules();
    const { default: FreshImageCropTool } = await import("../Tool");
    render(<FreshImageCropTool />);

    expect((screen.getByLabelText("Choose image file") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("group", { name: "Crop region" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download crop" })).not.toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("shows aspect and shape preset controls once an image is selected", async () => {
    mockObjectUrl();
    render(<ImageCropTool />);
    await selectImageFile();

    expect(screen.getByRole("radio", { name: "Free" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "1:1 (square)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "4:3" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "16:9" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "9:16" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Rectangle" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Circle" })).toBeInTheDocument();
  });

  it("selecting the 4:3 aspect preset reshapes the (initially square) crop region to that ratio (task 6.2)", async () => {
    mockObjectUrl();
    render(<ImageCropTool />);
    await selectImageFile();

    const group = screen.getByRole("group", { name: "Crop region" });
    // Default free-crop box is square: 80% x 80%.
    expect(group.style.width).toBe("80%");
    expect(group.style.height).toBe("80%");

    fireEvent.click(screen.getByRole("radio", { name: "4:3" }));

    await waitFor(() => {
      expect(group.style.width).toBe("80%");
    });
    const width = parseFloat(group.style.width);
    const height = parseFloat(group.style.height);
    expect(width / height).toBeCloseTo(4 / 3, 2);
  });

  it("switching back to 'free' after a preset removes the ratio constraint on further drags", async () => {
    mockObjectUrl();
    render(<ImageCropTool />);
    await selectImageFile();

    fireEvent.click(screen.getByRole("radio", { name: "1:1 (square)" }));
    fireEvent.click(screen.getByRole("radio", { name: "Free" }));
    expect(screen.getByRole("radio", { name: "Free" })).toBeChecked();

    vi.spyOn(HTMLImageElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 100,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const group = screen.getByRole("group", { name: "Crop region" });
    // A pure horizontal drag on the bottom-right corner would still be
    // forced into a square if the ratio were still locked (see the
    // "1:1 lock always yields a square" test in crop.test.ts) —
    // asserting it isn't, by only moving the x2 edge.
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Resize crop from bottom-right/ }), {
      clientX: 0,
      clientY: 0,
      pointerId: 1,
    });
    fireEvent.pointerMove(group, { clientX: 20, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(group, { clientX: 20, clientY: 0, pointerId: 1 });

    await waitFor(() => {
      const width = parseFloat(group.style.width);
      const height = parseFloat(group.style.height);
      expect(width / height).not.toBeCloseTo(1, 1);
    });
  });

  it("selecting circle forces the aspect to 1:1 and disables every other aspect preset (task 6.3)", async () => {
    mockObjectUrl();
    render(<ImageCropTool />);
    await selectImageFile();

    fireEvent.click(screen.getByRole("radio", { name: "16:9" }));
    fireEvent.click(screen.getByRole("radio", { name: "Circle" }));

    expect(screen.getByRole("radio", { name: "1:1 (square)" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Free" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "4:3" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "16:9" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "9:16" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "1:1 (square)" })).not.toBeDisabled();

    const group = screen.getByRole("group", { name: "Crop region" });
    const width = parseFloat(group.style.width);
    const height = parseFloat(group.style.height);
    expect(width).toBeCloseTo(height);
  });

  it("downloads a transparent-cornered PNG for a circle crop, clipping before drawing (task 6.6)", async () => {
    mockObjectUrl();
    const { ellipse, clip, getLastMimeType } = mockCanvasForCrop();
    mockAnchorClick();
    render(<ImageCropTool />);
    await selectImageFile();

    fireEvent.click(screen.getByRole("radio", { name: "Circle" }));
    fireEvent.click(screen.getByRole("button", { name: "Download crop" }));

    await waitFor(() => {
      expect(screen.getByText("Downloaded.")).toBeInTheDocument();
    });
    expect(ellipse.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(clip.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(getLastMimeType()).toBe("image/png");
  });

  it("a rectangle crop with a non-free aspect preset still keeps the original file's format (task 6.6)", async () => {
    mockObjectUrl();
    const { getLastMimeType } = mockCanvasForCrop();
    mockAnchorClick();
    render(<ImageCropTool />);
    await selectImageFile(); // photo.png

    fireEvent.click(screen.getByRole("radio", { name: "16:9" }));
    fireEvent.click(screen.getByRole("button", { name: "Download crop" }));

    await waitFor(() => {
      expect(screen.getByText("Downloaded.")).toBeInTheDocument();
    });
    expect(getLastMimeType()).toBe("image/png");
  });

  it("never writes to storage across every preset, and a reload leaves no trace of an undownloaded crop (task 6.7)", async () => {
    mockObjectUrl();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { unmount } = render(<ImageCropTool />);

    await selectImageFile();
    fireEvent.click(screen.getByRole("radio", { name: "16:9" }));
    fireEvent.click(screen.getByRole("radio", { name: "Circle" }));
    // Deliberately do not click Download — this crop is now unrecoverable.
    expect(setItem).not.toHaveBeenCalled();

    unmount();
    vi.resetModules();
    const { default: FreshImageCropTool } = await import("../Tool");
    render(<FreshImageCropTool />);

    expect((screen.getByLabelText("Choose image file") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("group", { name: "Crop region" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Circle" })).not.toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
  });
});
