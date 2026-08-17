import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SvgConvertTool from "../Tool";

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>`;

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 24;
  naturalHeight = 24;
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
  const createObjectURL = vi.fn(() => "blob:mock-url");
  const revokeObjectURL = vi.fn();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  return { createObjectURL, revokeObjectURL };
}

function mockCanvasForRaster() {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  let lastMimeType: string | undefined;
  const toBlob = vi.fn((callback: (blob: Blob | null) => void, type?: string) => {
    lastMimeType = type;
    callback(new Blob(["raster"], { type }));
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    toBlob as unknown as HTMLCanvasElement["toBlob"],
  );
  return { drawImage, toBlob, getLastMimeType: () => lastMimeType };
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

async function selectSvgFile(name = "icon.svg") {
  const input = screen.getByLabelText("Choose SVG file") as HTMLInputElement;
  const file = new File([ICON_SVG], name, { type: "image/svg+xml" });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Download PNG" })).toBeInTheDocument();
  });
  return file;
}

describe("SvgConvertTool", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders a file input and no convert UI before an SVG is chosen", () => {
    render(<SvgConvertTool />);

    expect(screen.getByRole("button", { name: "Choose SVG" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "PNG" })).not.toBeInTheDocument();
  });

  it("shows format, scale, and Download once an SVG is selected", async () => {
    mockObjectUrl();
    mockCanvasForRaster();
    render(<SvgConvertTool />);

    await selectSvgFile();

    expect(screen.getByRole("radio", { name: "PNG" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "WebP" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "2×" })).toBeChecked();
    expect(screen.getByText(/24 × 24/)).toBeInTheDocument();
    expect(screen.getByText(/48 × 48 px/)).toBeInTheDocument();
    expect(screen.getByText("icon.svg")).toBeInTheDocument();
  });

  it("rejects a non-SVG file with an alert and keeps the convert UI hidden", async () => {
    mockObjectUrl();
    render(<SvgConvertTool />);

    const input = screen.getByLabelText("Choose SVG file") as HTMLInputElement;
    const file = new File(["not-an-svg"], "photo.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't be read as an SVG/);
    expect(screen.queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
  });

  it("switching to WebP updates the download button label", async () => {
    mockObjectUrl();
    mockCanvasForRaster();
    render(<SvgConvertTool />);
    await selectSvgFile();

    fireEvent.click(screen.getByRole("radio", { name: "WebP" }));

    expect(screen.getByRole("button", { name: "Download WebP" })).toBeInTheDocument();
  });

  it("downloads the raster and makes no network request", async () => {
    mockObjectUrl();
    const { getLastMimeType } = mockCanvasForRaster();
    const click = mockAnchorClick();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<SvgConvertTool />);
    await selectSvgFile();

    fireEvent.click(screen.getByRole("button", { name: "Download PNG" }));

    await waitFor(() => {
      expect(screen.getByText("Downloaded.")).toBeInTheDocument();
    });
    expect(click).toHaveBeenCalledTimes(1);
    expect(getLastMimeType()).toBe("image/png");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("downloads WebP when that format is selected", async () => {
    mockObjectUrl();
    const { getLastMimeType } = mockCanvasForRaster();
    mockAnchorClick();
    render(<SvgConvertTool />);
    await selectSvgFile();

    fireEvent.click(screen.getByRole("radio", { name: "WebP" }));
    fireEvent.click(screen.getByRole("button", { name: "Download WebP" }));

    await waitFor(() => {
      expect(screen.getByText("Downloaded.")).toBeInTheDocument();
    });
    expect(getLastMimeType()).toBe("image/webp");
  });

  it("never writes to localStorage or sessionStorage, and a reload leaves no trace", async () => {
    mockObjectUrl();
    mockCanvasForRaster();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { unmount } = render(<SvgConvertTool />);

    await selectSvgFile();
    expect(setItem).not.toHaveBeenCalled();

    unmount();
    vi.resetModules();
    const { default: FreshSvgConvertTool } = await import("../Tool");
    render(<FreshSvgConvertTool />);

    expect((screen.getByLabelText("Choose SVG file") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
  });
});
