"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  buildPdfFileName,
  buildPrintDocument,
  MARGIN_SIZES,
  PAGE_SIZES,
  type MarginSize,
  type PageSize,
  type Typeface,
} from "./document";
import { EXAMPLE_MARKDOWN } from "./example";
import { renderMarkdown } from "./markdown";
import { printDocument } from "./print";

const TYPEFACES: ReadonlyArray<{ id: Typeface; label: string }> = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
];

/**
 * Markdown → PDF. The Markdown is parsed to HTML in ./markdown.ts, styled
 * for paper in ./document.ts, and handed to the browser's own print engine
 * in ./print.ts — which is what makes the text in the PDF real, selectable
 * text rather than a picture of text.
 *
 * Deliberately does not import anything from password-generator/recents —
 * see eslint.config.mjs's `no-restricted-imports` boundary.
 */
export default function MdToPdfTool() {
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>("a4");
  const [margin, setMargin] = useState<MarginSize>("normal");
  const [typeface, setTypeface] = useState<Typeface>("sans");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceId = useId();

  const document_ = useMemo(() => renderMarkdown(source), [source]);
  const isBlank = source.trim().length === 0;

  // The document title, and so the browser's suggested filename, comes from
  // the first `# heading`, then the uploaded file's name, then a fallback.
  const title =
    document_.title ?? (fileName ? fileName.replace(/\.(md|markdown|txt)$/i, "") : "Document");

  // The preview is the print document itself, rendered in an iframe with
  // the sheet geometry switched on. Nothing is approximated and nothing is
  // re-styled, so page size, margins and typeface show their real effect —
  // and the app's own CSS cannot reach inside to change the result.
  const previewDocument = useMemo(
    () =>
      buildPrintDocument({
        html: document_.html,
        title,
        pageSize,
        margin,
        typeface,
        preview: true,
      }),
    [document_.html, title, pageSize, margin, typeface],
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    setError(null);
    try {
      const text = await file.text();
      setSource(text);
      setFileName(file.name);
    } catch {
      setError("That file couldn't be read. Try a different one.");
    }
  }

  async function handlePrint() {
    if (isBlank) return;
    setError(null);
    try {
      await printDocument(
        buildPrintDocument({
          html: document_.html,
          title: buildPdfFileName(title),
          pageSize,
          margin,
          typeface,
        }),
      );
    } catch {
      setError("Opening the print dialog failed. Check that pop-ups aren't blocked.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor={sourceId} className="text-sm font-medium">
            Markdown
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              onChange={handleFileChange}
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose Markdown file"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-default border border-border px-3 py-1.5 text-sm transition hover:bg-foreground/5"
            >
              Open .md file
            </button>
            {isBlank ? (
              <button
                type="button"
                onClick={() => {
                  setSource(EXAMPLE_MARKDOWN);
                  setFileName(null);
                }}
                className="rounded-default border border-border px-3 py-1.5 text-sm transition hover:bg-foreground/5"
              >
                Load example
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSource("");
                  setFileName(null);
                }}
                className="rounded-default border border-border px-3 py-1.5 text-sm transition hover:bg-foreground/5"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <textarea
          id={sourceId}
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            setFileName(null);
          }}
          spellCheck={false}
          rows={12}
          placeholder={"# Your document\n\nWrite Markdown here, or open a .md file above."}
          className="w-full resize-y rounded-default border border-border bg-transparent p-3 font-mono text-sm leading-relaxed outline-none focus:border-accent"
        />
        {fileName ? (
          <span className="text-xs text-foreground/60">Loaded {fileName}</span>
        ) : null}
      </section>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Preview</h2>
        <div className="rounded-default border border-border bg-zinc-100 p-4 dark:bg-zinc-800">
          {isBlank ? (
            <p className="py-12 text-center text-sm text-foreground/50">
              Your document appears here as you type.
            </p>
          ) : (
            <iframe
              title="PDF preview"
              srcDoc={previewDocument}
              // sandbox with neither allow-scripts nor allow-same-origin:
              // the preview only ever needs to lay out static markup, and
              // the parser's escaping is not the only thing standing
              // between an untrusted document and this origin.
              sandbox=""
              className="h-[36rem] w-full rounded-sm border-0 bg-white shadow-sm"
            />
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Page size</legend>
          <div className="flex flex-wrap gap-3">
            {PAGE_SIZES.map((option) => (
              <label key={option.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="md-page-size"
                  checked={pageSize === option.id}
                  onChange={() => setPageSize(option.id)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Margins</legend>
          <div className="flex flex-wrap gap-3">
            {MARGIN_SIZES.map((option) => (
              <label key={option.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="md-margin"
                  checked={margin === option.id}
                  onChange={() => setMargin(option.id)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Typeface</legend>
          <div className="flex flex-wrap gap-3">
            {TYPEFACES.map((option) => (
              <label key={option.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="md-typeface"
                  checked={typeface === option.id}
                  onChange={() => setTypeface(option.id)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePrint}
            disabled={isBlank}
            className="rounded-default bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save as PDF
          </button>
          <span className="text-xs text-foreground/60">
            Opens your browser&apos;s print dialog — choose{" "}
            <strong className="font-medium">Save as PDF</strong> as the destination.
          </span>
        </div>
        <p className="text-xs text-foreground/50">
          Text in the PDF stays real text: selectable, searchable and
          copyable. Page numbers come from the print dialog&apos;s own
          headers-and-footers option, not from this tool.
        </p>
      </div>

      <p className="text-xs text-foreground/50">
        Inline HTML in the Markdown is shown as text rather than rendered, so
        a document from an untrusted source can&apos;t run scripts here.
        Reloading the page clears the editor with no way to recover it.
      </p>
    </div>
  );
}
