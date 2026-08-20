import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MdToPdfTool from "../Tool";

// printDocument drives window.print through an iframe, which jsdom does not
// implement. Mocking this seam keeps the component's own behaviour testable
// without asserting on a DOM API that isn't there.
const printDocument = vi.hoisted(() =>
  vi.fn((_html: string) => Promise.resolve()),
);
vi.mock("../print", () => ({ printDocument }));

const previewSrcDoc = () =>
  (screen.getByTitle("PDF preview") as HTMLIFrameElement).getAttribute("srcdoc") ?? "";

function typeMarkdown(value: string) {
  fireEvent.change(screen.getByLabelText("Markdown"), { target: { value } });
}

beforeEach(() => {
  printDocument.mockClear();
});

describe("empty state", () => {
  it("shows a placeholder instead of a preview and disables saving", () => {
    render(<MdToPdfTool />);

    expect(screen.getByText(/Your document appears here as you type/)).toBeInTheDocument();
    expect(screen.queryByTitle("PDF preview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as PDF" })).toBeDisabled();
  });

  it("fills the editor from the example and then offers Clear instead", () => {
    render(<MdToPdfTool />);
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));

    expect((screen.getByLabelText("Markdown") as HTMLTextAreaElement).value).toContain(
      "# Quarterly Field Report",
    );
    expect(screen.getByRole("button", { name: "Save as PDF" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load example" })).not.toBeInTheDocument();
  });

  it("returns to the empty state when cleared", () => {
    render(<MdToPdfTool />);
    fireEvent.click(screen.getByRole("button", { name: "Load example" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByRole("button", { name: "Save as PDF" })).toBeDisabled();
    expect(screen.getByText(/Your document appears here as you type/)).toBeInTheDocument();
  });
});

describe("preview", () => {
  it("renders parsed Markdown into the preview document", () => {
    render(<MdToPdfTool />);
    typeMarkdown("# Hello\n\nSome **bold** text.");

    const doc = previewSrcDoc();
    expect(doc).toContain("<h1>Hello</h1>");
    expect(doc).toContain("<strong>bold</strong>");
  });

  it("keeps inline HTML from the source inert", () => {
    render(<MdToPdfTool />);
    typeMarkdown("<script>alert(1)</script>");

    const doc = previewSrcDoc();
    // The only <script> in the document would have to come from the source.
    expect(doc).not.toContain("<script>");
    expect(doc).toContain("&lt;script&gt;");
  });

  it("is sandboxed with neither scripts nor same-origin access", () => {
    render(<MdToPdfTool />);
    typeMarkdown("# Hello");

    expect(screen.getByTitle("PDF preview")).toHaveAttribute("sandbox", "");
  });
});

describe("page options change the document", () => {
  it("switches page size", () => {
    render(<MdToPdfTool />);
    typeMarkdown("# Hello");
    expect(previewSrcDoc()).toContain("210mm 297mm");

    fireEvent.click(screen.getByRole("radio", { name: "Letter" }));
    expect(previewSrcDoc()).toContain("8.5in 11in");
  });

  it("switches margins", () => {
    render(<MdToPdfTool />);
    typeMarkdown("# Hello");
    expect(previewSrcDoc()).toContain("margin: 20mm");

    fireEvent.click(screen.getByRole("radio", { name: "Narrow" }));
    expect(previewSrcDoc()).toContain("margin: 12mm");
  });

  it("switches typeface", () => {
    render(<MdToPdfTool />);
    typeMarkdown("# Hello");
    expect(previewSrcDoc()).not.toContain("Georgia");

    fireEvent.click(screen.getByRole("radio", { name: "Serif" }));
    expect(previewSrcDoc()).toContain("Georgia");
  });
});

describe("saving", () => {
  it("prints a document without the preview-only screen rules", async () => {
    render(<MdToPdfTool />);
    typeMarkdown("# Hello");
    fireEvent.click(screen.getByRole("button", { name: "Save as PDF" }));

    expect(printDocument).toHaveBeenCalledTimes(1);
    const printed = printDocument.mock.calls[0][0];
    expect(printed).toContain("<h1>Hello</h1>");
    expect(printed).not.toContain("@media screen");
  });

  it("titles the document from the first heading, so the browser suggests that filename", () => {
    render(<MdToPdfTool />);
    typeMarkdown("# Quarterly Field Report\n\ntext");
    fireEvent.click(screen.getByRole("button", { name: "Save as PDF" }));

    expect(printDocument.mock.calls[0][0]).toContain(
      "<title>quarterly-field-report</title>",
    );
  });

  it("carries the chosen page options into the printed document", () => {
    render(<MdToPdfTool />);
    typeMarkdown("# Hello");
    fireEvent.click(screen.getByRole("radio", { name: "Letter" }));
    fireEvent.click(screen.getByRole("radio", { name: "Wide" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as PDF" }));

    const printed = printDocument.mock.calls[0][0];
    expect(printed).toContain("8.5in 11in");
    expect(printed).toContain("margin: 28mm");
  });

  it("surfaces a readable error when printing fails", async () => {
    printDocument.mockRejectedValueOnce(new Error("blocked"));
    render(<MdToPdfTool />);
    typeMarkdown("# Hello");
    fireEvent.click(screen.getByRole("button", { name: "Save as PDF" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/print dialog failed/i);
  });
});
