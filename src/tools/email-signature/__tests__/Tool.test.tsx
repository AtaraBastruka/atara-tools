import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BARE_BACKDROPS, DEFAULT_ACCENT } from "../signature";
import EmailSignatureTool from "../Tool";

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";

function mockClipboard() {
  const writeText = vi.fn(() => Promise.resolve());
  const write = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText, write },
    configurable: true,
    writable: true,
  });
  return { writeText, write };
}

/** jsdom has no ClipboardItem; the component's fallback path depends on that. */
function removeClipboardItem() {
  Reflect.deleteProperty(globalThis as Record<string, unknown>, "ClipboardItem");
}

/**
 * The form starts blank on purpose — every field is a placeholder — so a
 * test that needs a rendered signature has to fill it first. One click on
 * "Load example" is the same path a first-time user takes.
 */
function loadExample() {
  fireEvent.click(screen.getByRole("button", { name: "Load example" }));
}

function previewHtml(): string {
  const preview = document.querySelector("[style*='border-collapse']");
  return preview?.closest("div")?.innerHTML ?? "";
}

beforeEach(() => {
  removeClipboardItem();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("preview", () => {
  it("starts blank, offering the example rather than pretending to be filled in", () => {
    render(<EmailSignatureTool />);

    expect(screen.getByText(/Your signature appears here/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy signature" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download PNG" })).toBeDisabled();
    expect(screen.getByLabelText("Full name")).toHaveValue("");
    expect(screen.getByLabelText("Full name")).toHaveAttribute("placeholder", "Alex Rivera");
  });

  it("renders the example's real markup once loaded, not a stand-in", () => {
    render(<EmailSignatureTool />);
    loadExample();

    expect(screen.getByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("PRODUCT DESIGNER")).toBeInTheDocument();
    expect(screen.getByText("DESIGN & ENGINEERING STUDIO")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "example.com" })).toHaveAttribute(
      "href",
      "https://example.com/",
    );
  });

  it("updates live as fields change", async () => {
    render(<EmailSignatureTool />);
    loadExample();

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Luis Q" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Architect" } });

    await waitFor(() => {
      expect(screen.getByText("Luis Q")).toBeInTheDocument();
      expect(screen.getByText("ARCHITECT")).toBeInTheDocument();
    });
    expect(screen.queryByText("Alex Rivera")).not.toBeInTheDocument();
  });

  it("adds a chip per link and drops unusable entries", async () => {
    render(<EmailSignatureTool />);
    loadExample();

    fireEvent.change(screen.getByLabelText(/^Links/), {
      target: { value: "one.com\njavascript:alert(1)\ntwo.com" },
    });

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "one.com" })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "two.com" })).toBeInTheDocument();
    // The rejected entry produces no chip at all — it is dropped, not
    // rendered as a dead link. (It stays in the textarea the user typed
    // it into, which is why this checks links rather than page text.)
    expect(document.querySelectorAll('a[href^="https:"]')).toHaveLength(2);
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("never lets typed markup become live elements in the preview", async () => {
    render(<EmailSignatureTool />);
    loadExample();

    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: '<img src=x onerror="alert(1)">' },
    });

    await waitFor(() => {
      expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    });
    expect(document.querySelector("img[onerror]")).toBeNull();
  });
});

describe("backdrop mode", () => {
  it("swaps the background colour picker for a contrast surface choice", async () => {
    render(<EmailSignatureTool />);
    loadExample();

    expect(screen.getByLabelText("Background colour")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/No background box/));

    await waitFor(() => {
      expect(screen.queryByLabelText("Background colour")).not.toBeInTheDocument();
    });
    // The background options are gone, replaced by the one thing that
    // still matters without a card: what it will be read against.
    expect(screen.getByRole("radio", { name: "light" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "dark" })).toBeInTheDocument();
    expect(screen.getByLabelText("Accent colour")).toBeInTheDocument();
  });

  it("stops painting a card, and flips text with the chosen surface", async () => {
    render(<EmailSignatureTool />);
    loadExample();
    fireEvent.click(screen.getByLabelText(/No background box/));

    await waitFor(() => {
      expect(previewHtml()).not.toContain("radial-gradient");
    });
    expect(previewHtml()).not.toContain("border-radius:26px");
    // Light surface -> dark type.
    expect(previewHtml()).toContain("color:#101010");

    fireEvent.click(screen.getByRole("radio", { name: "dark" }));

    await waitFor(() => {
      expect(previewHtml()).toContain("color:#ffffff");
    });
    // Still never painted, whichever surface is chosen.
    expect(previewHtml()).not.toContain(`background-color:${BARE_BACKDROPS.dark}`);
  });

  it("hides the transparent-edges option, which has no meaning without a card", async () => {
    render(<EmailSignatureTool />);
    loadExample();

    expect(screen.getByLabelText("Transparent edges")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/No background box/));

    await waitFor(() => {
      expect(screen.queryByLabelText("Transparent edges")).not.toBeInTheDocument();
    });
  });
});

describe("PNG-only options", () => {
  it("says what the scale does, since it never changes the preview", async () => {
    render(<EmailSignatureTool />);
    loadExample();

    expect(screen.getByText(/2× exports at 2400px wide/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("3×"));

    await waitFor(() => {
      expect(screen.getByText(/3× exports at 3600px wide/)).toBeInTheDocument();
    });
  });

  it("leaves the preview untouched when a PNG-only option changes", async () => {
    render(<EmailSignatureTool />);
    loadExample();
    const before = previewHtml();

    fireEvent.click(screen.getByLabelText("3×"));
    fireEvent.click(screen.getByLabelText("Transparent edges"));

    await waitFor(() => {
      expect(screen.getByText(/3× exports/)).toBeInTheDocument();
    });
    // This is the confusion the grouping exists to prevent: these two
    // controls genuinely do nothing to the pasteable HTML.
    expect(previewHtml()).toBe(before);
  });
});

describe("colours", () => {
  it("repaints the signature from the chosen background", async () => {
    render(<EmailSignatureTool />);
    loadExample();

    fireEvent.change(screen.getByLabelText("Background colour"), {
      target: { value: "#101820" },
    });

    await waitFor(() => {
      expect(previewHtml()).toContain("background-color:#101820");
    });
  });

  it("flags an invalid hex and keeps rendering with the last good palette", async () => {
    render(<EmailSignatureTool />);
    loadExample();

    fireEvent.change(screen.getByLabelText("Accent colour"), { target: { value: "not-a-colour" } });

    await waitFor(() => {
      expect(screen.getByText(/Not a hex colour/)).toBeInTheDocument();
    });
    // Still the default accent, and no raw string leaked into a style attribute.
    expect(previewHtml()).toContain(DEFAULT_ACCENT);
    expect(previewHtml()).not.toContain("not-a-colour");
  });
});

describe("logo", () => {
  it("reads a chosen file locally and warns that Gmail strips data: URLs", async () => {
    render(<EmailSignatureTool />);

    loadExample();
    const input = screen.getByLabelText("Choose logo file") as HTMLInputElement;
    const file = new File(["binary"], "logo.png", { type: "image/png" });
    vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (
      this: FileReader,
    ) {
      Object.defineProperty(this, "result", { value: PNG_DATA_URL, configurable: true });
      this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>);
    });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("logo.png")).toBeInTheDocument();
    });
    expect(screen.getByText(/Gmail\s+strips those/)).toBeInTheDocument();
    expect(previewHtml()).toContain(PNG_DATA_URL);
  });

  it("prefers a hosted URL over the uploaded file and stops warning", async () => {
    render(<EmailSignatureTool />);
    loadExample();

    fireEvent.change(screen.getByLabelText("Hosted logo URL"), {
      target: { value: "https://cdn.example.com/logo.png" },
    });

    await waitFor(() => {
      expect(previewHtml()).toContain("https://cdn.example.com/logo.png");
    });
    expect(screen.queryByText(/Gmail\s+strips those/)).not.toBeInTheDocument();
  });

  it("falls back to the company name when there is no logo at all", () => {
    render(<EmailSignatureTool />);
    loadExample();

    expect(screen.getByText("Northwind")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });
});

describe("copy", () => {
  it("falls back to writing raw markup when ClipboardItem is unavailable", async () => {
    const { writeText, write } = mockClipboard();
    render(<EmailSignatureTool />);
    loadExample();

    fireEvent.click(screen.getByRole("button", { name: "Copy signature" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/Signature copied/);
    });
    expect(write).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("<table"));
  });

  it("writes both text/html and text/plain when ClipboardItem exists", async () => {
    const { write } = mockClipboard();
    class FakeClipboardItem {
      constructor(public readonly items: Record<string, Blob>) {}
    }
    Object.defineProperty(globalThis, "ClipboardItem", {
      value: FakeClipboardItem,
      configurable: true,
      writable: true,
    });

    render(<EmailSignatureTool />);
    loadExample();
    fireEvent.click(screen.getByRole("button", { name: "Copy signature" }));

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const [[[item]]] = write.mock.calls as unknown as [[[FakeClipboardItem]]];
    expect(Object.keys(item.items)).toEqual(["text/html", "text/plain"]);
  });

  it("copies the raw markup on “Copy HTML code”", async () => {
    const { writeText } = mockClipboard();
    render(<EmailSignatureTool />);
    loadExample();

    fireEvent.click(screen.getByRole("button", { name: "Copy HTML code" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("HTML code copied.");
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('role="presentation"'));
  });

  it("surfaces a usable fallback when the clipboard is blocked", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) },
      configurable: true,
      writable: true,
    });
    render(<EmailSignatureTool />);
    loadExample();

    fireEvent.click(screen.getByRole("button", { name: "Copy signature" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/Copy HTML code/);
    });
  });

  it("clears the last status as soon as the signature changes again", async () => {
    mockClipboard();
    render(<EmailSignatureTool />);
    loadExample();

    fireEvent.click(screen.getByRole("button", { name: "Copy HTML code" }));
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Someone Else" } });

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});

describe("PNG export", () => {
  function mockCanvas() {
    // jsdom ships no 2D context. Unknown members resolve to no-ops, but the
    // gradient factories must hand back something with addColorStop or the
    // renderer throws and the test sees an error instead of a download.
    const gradient = { addColorStop: () => undefined };
    const context = new Proxy(
      {
        canvas: {},
        measureText: () => ({ width: 10 }),
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient,
      },
      { get: (target, key) => Reflect.get(target, key) ?? (() => undefined) },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(((
      callback: (blob: Blob | null) => void,
      type?: string,
    ) => {
      callback(new Blob(["png"], { type }));
    }) as unknown as HTMLCanvasElement["toBlob"]);
  }

  function mockAnchorClick() {
    const click = vi.fn();
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = realCreateElement(tagName);
      if (tagName === "a") {
        vi.spyOn(element as HTMLAnchorElement, "click").mockImplementation(click);
      }
      return element;
    });
    return click;
  }

  it("downloads a PNG named after the person, at the chosen scale", async () => {
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    });
    mockCanvas();
    const click = mockAnchorClick();

    render(<EmailSignatureTool />);
    loadExample();
    fireEvent.click(screen.getByLabelText("3×"));
    fireEvent.click(screen.getByRole("button", { name: "Download PNG" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("PNG downloaded at 3×.");
    });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("explains the CORS limit when a hosted logo can't be drawn", async () => {
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin: string | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", FailingImage);
    mockCanvas();

    render(<EmailSignatureTool />);
    loadExample();
    fireEvent.change(screen.getByLabelText("Hosted logo URL"), {
      target: { value: "https://cdn.example.com/logo.png" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Download PNG" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/cross-origin/);
    });

    vi.unstubAllGlobals();
  });
});
