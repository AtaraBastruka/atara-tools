import { describe, expect, it } from "vitest";
import {
  buildPdfFileName,
  buildPreviewStyles,
  buildPrintDocument,
  buildPrintStyles,
  MARGIN_SIZES,
  PAGE_SIZES,
} from "../document";

const baseOptions = {
  html: "<h1>Title</h1>",
  title: "report",
  pageSize: "a4",
  margin: "normal",
  typeface: "sans",
} as const;

describe("page setup", () => {
  it("writes the chosen page size and margin into @page", () => {
    const css = buildPrintStyles("a4", "wide", "sans");
    expect(css).toContain("size: 210mm 297mm");
    expect(css).toContain("margin: 28mm");
  });

  it("switches to Letter dimensions", () => {
    expect(buildPrintStyles("letter", "narrow", "sans")).toContain("size: 8.5in 11in");
  });

  it("offers a width for every page size, for the preview sheet", () => {
    for (const size of PAGE_SIZES) {
      expect(size.width).toMatch(/^[\d.]+(mm|in)$/);
    }
    expect(MARGIN_SIZES).toHaveLength(3);
  });
});

describe("typeface", () => {
  it("uses a serif stack only when serif is chosen", () => {
    expect(buildPrintStyles("a4", "normal", "serif")).toContain("Georgia");
    expect(buildPrintStyles("a4", "normal", "sans")).not.toContain("Georgia");
  });

  it("never references a webfont, which would not load in a print job", () => {
    const css = buildPrintStyles("a4", "normal", "sans");
    expect(css).not.toContain("@import");
    expect(css).not.toContain("fonts.googleapis");
  });
});

describe("pagination rules", () => {
  it("keeps headings with the block that follows", () => {
    expect(buildPrintStyles("a4", "normal", "sans")).toContain("break-after: avoid-page");
  });

  it("wraps long code lines rather than letting them run off the page", () => {
    const css = buildPrintStyles("a4", "normal", "sans");
    expect(css).toContain("white-space: pre-wrap");
    expect(css).toContain("word-break: break-word");
  });

  it("repeats a table header across pages", () => {
    expect(buildPrintStyles("a4", "normal", "sans")).toContain("display: table-header-group");
  });
});

describe("preview styles", () => {
  it("shapes the body to the page width inside a screen-only block", () => {
    const css = buildPreviewStyles("a4", "wide");
    expect(css).toContain("@media screen");
    expect(css).toContain("width: 210mm");
    expect(css).toContain("padding: 28mm");
  });

  it("is absent from the printed document so it cannot affect paper", () => {
    const printed = buildPrintDocument(baseOptions);
    expect(printed).not.toContain("@media screen");
  });

  it("is present when the preview flag is set", () => {
    const preview = buildPrintDocument({ ...baseOptions, preview: true });
    expect(preview).toContain("@media screen");
  });
});

describe("buildPrintDocument", () => {
  it("produces a standalone document carrying its own styles", () => {
    const out = buildPrintDocument(baseOptions);
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain("<title>report</title>");
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain("@page");
  });

  it("never links an external stylesheet, so the document cannot depend on the app", () => {
    expect(buildPrintDocument(baseOptions)).not.toContain("<link");
  });
});

describe("buildPdfFileName", () => {
  it("slugifies a title", () => {
    expect(buildPdfFileName("Quarterly Field Report")).toBe("quarterly-field-report");
  });

  it("strips diacritics rather than dropping the characters", () => {
    expect(buildPdfFileName("Informe Anual Ángel")).toBe("informe-anual-angel");
  });

  it("falls back when a title slugifies to nothing", () => {
    expect(buildPdfFileName("!!!")).toBe("document");
    expect(buildPdfFileName("")).toBe("document");
  });
});
