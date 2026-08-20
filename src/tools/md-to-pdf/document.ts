/**
 * Builds the standalone HTML document that gets printed to PDF.
 *
 * The rendered Markdown is printed from its own hidden iframe rather than
 * from the page, for two reasons: the app's chrome (nav, footer, theme)
 * never leaks into the output, and the print stylesheet here is the only
 * stylesheet in that document, so it cannot be overridden by Tailwind's
 * cascade or by the user's dark theme.
 *
 * Page numbers are deliberately absent. CSS Paged Media margin boxes
 * (`@bottom-center { content: counter(page) }`) are not implemented by any
 * browser without a pagination polyfill; the browser's own print header and
 * footer provide them instead, toggled in the print dialog.
 */

export type PageSize = "a4" | "letter";
export type MarginSize = "narrow" | "normal" | "wide";
export type Typeface = "sans" | "serif";

export const PAGE_SIZES: ReadonlyArray<{
  id: PageSize;
  label: string;
  css: string;
  /** Page width alone, used to shape the on-screen preview sheet. */
  width: string;
}> = [
  { id: "a4", label: "A4", css: "210mm 297mm", width: "210mm" },
  { id: "letter", label: "Letter", css: "8.5in 11in", width: "8.5in" },
];

export const MARGIN_SIZES: ReadonlyArray<{ id: MarginSize; label: string; css: string }> = [
  { id: "narrow", label: "Narrow", css: "12mm" },
  { id: "normal", label: "Normal", css: "20mm" },
  { id: "wide", label: "Wide", css: "28mm" },
];

// No webfonts: a print job renders with locally installed faces, and a
// font that fails to load would silently change every measurement.
const FONT_STACKS: Record<Typeface, string> = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  serif: "Georgia, Cambria, 'Times New Roman', Times, serif",
};

const MONO_STACK =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

export interface PrintOptions {
  html: string;
  title: string;
  pageSize: PageSize;
  margin: MarginSize;
  typeface: Typeface;
  /**
   * Adds screen-only rules that shape the body into a page-width sheet with
   * the chosen margins. `@page` governs paper and is inert on screen, so
   * without this the preview would show the right type at the wrong measure.
   */
  preview?: boolean;
}

function cssFor(option: PageSize | MarginSize, table: ReadonlyArray<{ id: string; css: string }>): string {
  return table.find((entry) => entry.id === option)?.css ?? table[0].css;
}

function pageWidth(pageSize: PageSize): string {
  return PAGE_SIZES.find((entry) => entry.id === pageSize)?.width ?? PAGE_SIZES[0].width;
}

/**
 * Screen-only sheet geometry for the preview. Scoped to `@media screen` so
 * it cannot affect the printed result, which stays governed by `@page`.
 */
export function buildPreviewStyles(pageSize: PageSize, margin: MarginSize): string {
  return `@media screen {
  body {
    box-sizing: border-box;
    width: ${pageWidth(pageSize)};
    max-width: 100%;
    padding: ${cssFor(margin, MARGIN_SIZES)};
    margin: 0 auto;
  }
}`;
}

export function buildPrintStyles(
  pageSize: PageSize,
  margin: MarginSize,
  typeface: Typeface,
): string {
  return `
@page { size: ${cssFor(pageSize, PAGE_SIZES)}; margin: ${cssFor(margin, MARGIN_SIZES)}; }

html, body { margin: 0; padding: 0; background: #ffffff; }
body {
  font-family: ${FONT_STACKS[typeface]};
  font-size: 11pt;
  line-height: 1.55;
  color: #16181d;
  /* Chrome's default is to shrink text when printing; opt out so what the
     preview shows is the size that lands on the page. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* A heading stranded at the foot of a page is the most common ugly break,
   so headings stay with the block that follows them. */
h1, h2, h3, h4, h5, h6 {
  break-after: avoid-page;
  page-break-after: avoid;
  line-height: 1.25;
  font-weight: 700;
  margin: 1.4em 0 0.5em;
}
h1 { font-size: 21pt; margin-top: 0; letter-spacing: -0.01em; }
h2 { font-size: 15.5pt; }
h3 { font-size: 13pt; }
h4 { font-size: 11.5pt; }
h5, h6 { font-size: 11pt; }
h6 { color: #5b6270; }

p { margin: 0 0 0.85em; orphans: 3; widows: 3; }

a { color: #1b52c4; text-decoration: underline; }

strong { font-weight: 700; }
em { font-style: italic; }
del { color: #6b7280; }

ul, ol { margin: 0 0 0.85em; padding-left: 1.6em; }
li { margin: 0.2em 0; break-inside: avoid; page-break-inside: avoid; }
li > ul, li > ol { margin: 0.2em 0 0; }

blockquote {
  margin: 0 0 0.85em;
  padding: 0.1em 0 0.1em 1em;
  border-left: 3px solid #d3d7de;
  color: #454b57;
  break-inside: avoid;
  page-break-inside: avoid;
}

code {
  font-family: ${MONO_STACK};
  font-size: 0.88em;
  background: #f2f3f5;
  padding: 0.12em 0.34em;
  border-radius: 3px;
}

pre {
  margin: 0 0 0.95em;
  padding: 0.75em 0.9em;
  background: #f6f7f9;
  border: 1px solid #e3e6ea;
  border-radius: 5px;
  /* Long lines wrap instead of running off the page edge. A PDF that
     silently clips code is worse than one with a wrapped line. */
  white-space: pre-wrap;
  word-break: break-word;
  break-inside: avoid;
  page-break-inside: avoid;
}
pre code { background: none; padding: 0; font-size: 9.5pt; border-radius: 0; }

table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 0.95em;
  font-size: 10pt;
  break-inside: avoid;
  page-break-inside: avoid;
}
th, td { border: 1px solid #d3d7de; padding: 0.4em 0.6em; text-align: left; vertical-align: top; }
th { background: #f2f3f5; font-weight: 700; }
/* Repeat the header on every page a long table spills onto. */
thead { display: table-header-group; }

hr { border: 0; border-top: 1px solid #d3d7de; margin: 1.6em 0; }

img { max-width: 100%; height: auto; break-inside: avoid; }
`.trim();
}

/**
 * Slugifies the document title into a filename. Only ever a *suggestion* —
 * the browser's print dialog owns the real filename, so this is used for
 * the iframe's document title, which is what most browsers pre-fill with.
 */
export function buildPdfFileName(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || "document";
}

export function buildPrintDocument({
  html,
  title,
  pageSize,
  margin,
  typeface,
  preview = false,
}: PrintOptions): string {
  // The <title> becomes the browser's suggested PDF filename.
  const safeTitle = title.replace(/[<>&]/g, "");
  const styles = preview
    ? `${buildPrintStyles(pageSize, margin, typeface)}\n${buildPreviewStyles(pageSize, margin)}`
    : buildPrintStyles(pageSize, margin, typeface);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<style>${styles}</style>
</head>
<body>${html}</body>
</html>`;
}
