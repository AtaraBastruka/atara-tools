"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  type BackdropMode,
  BARE_BACKDROPS,
  type BareSurface,
  buildSignatureHtml,
  clampLogoWidth,
  DEFAULT_ACCENT,
  DEFAULT_BACKGROUND,
  derivePalette,
  EMPTY_SIGNATURE,
  EXAMPLE_SIGNATURE,
  isBlank,
  MAX_LOGO_WIDTH,
  MIN_LOGO_WIDTH,
  normalizeHex,
  resolveLogoSrc,
  type SignatureData,
} from "./signature";
import {
  buildPngFileName,
  loadLogoImage,
  renderSignatureBlob,
  triggerDownload,
} from "./render";

const PNG_SCALES = [1, 2, 3] as const;
type PngScale = (typeof PNG_SCALES)[number];

const BACKDROP_OPTIONS: { id: BackdropMode; label: string; hint: string }[] = [
  {
    id: "boxed",
    label: "Coloured box",
    hint: "A rounded card in your background colour.",
  },
  {
    id: "bare",
    label: "No background box",
    hint: "Type and rule only, on the email's own background.",
  },
];

const BARE_SURFACES: BareSurface[] = ["light", "dark"];

interface Feedback {
  kind: "status" | "error";
  message: string;
  /** The signature markup this message described, so edits retire it. */
  forHtml: string;
}

const FIELD_CLASS =
  "w-full rounded-default border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

const SECONDARY_BUTTON_CLASS =
  "rounded-default border border-border px-4 py-2 text-sm font-medium transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  // The hint sits outside the <label> on purpose: text inside a wrapping
  // label becomes part of the control's accessible name, so a screen
  // reader would announce the whole hint every time the field is focused.
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        {children}
      </label>
      {hint ? <span className="text-xs text-foreground/55">{hint}</span> : null}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const normalized = normalizeHex(value);

  // Two controls share one caption, so this is a labelled group rather
  // than a <label> — a wrapping label would name both inputs identically
  // and drag the error text into both accessible names.
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium" aria-hidden="true">
        {label}
      </span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={normalized ?? "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-default border border-border bg-background p-1"
        />
        <input
          type="text"
          aria-label={label}
          aria-invalid={normalized === null}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className={`${FIELD_CLASS} font-mono ${normalized ? "" : "border-red-500"}`}
        />
      </span>
      {normalized ? null : (
        <span className="text-xs text-red-600 dark:text-red-400">
          Not a hex colour — using the previous value.
        </span>
      )}
    </div>
  );
}

/**
 * Email signature builder. Two exports over one model: email-safe HTML
 * (see ./signature.ts) and a canvas PNG (see ./render.ts). The preview
 * below renders the *exact* HTML string that "Copy signature" produces,
 * so there is no prettier preview-only code path to drift out of sync.
 *
 * Fully local: the logo file is read with FileReader, never uploaded, and
 * nothing — not the details, not the colours — is persisted anywhere.
 * Deliberately does not import password-generator/recents; see
 * eslint.config.mjs's `no-restricted-imports` boundary.
 */
export default function EmailSignatureTool() {
  const [data, setData] = useState<SignatureData>(EMPTY_SIGNATURE);
  const [backgroundInput, setBackgroundInput] = useState(DEFAULT_BACKGROUND);
  const [accentInput, setAccentInput] = useState(DEFAULT_ACCENT);
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const [scale, setScale] = useState<PngScale>(2);
  const [transparentMargin, setTransparentMargin] = useState(true);
  const [mode, setMode] = useState<BackdropMode>("boxed");
  const [bareSurface, setBareSurface] = useState<BareSurface>("light");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputId = useId();

  // Boxed, contrast derives against the card the user painted. Bare,
  // there is no card, so it derives against the body colour the
  // signature will land on — a colour we never paint, only read.
  const contrastAgainst =
    mode === "boxed"
      ? (normalizeHex(backgroundInput) ?? DEFAULT_BACKGROUND)
      : BARE_BACKDROPS[bareSurface];

  const palette = useMemo(
    () => derivePalette(contrastAgainst, normalizeHex(accentInput) ?? DEFAULT_ACCENT),
    [contrastAgainst, accentInput],
  );

  const html = useMemo(() => buildSignatureHtml(data, palette, mode), [data, palette, mode]);
  const logoSrc = resolveLogoSrc(data);
  const usesInlineLogo = logoSrc !== null && logoSrc.startsWith("data:");
  const blank = isBlank(data);

  // Feedback is stamped with the signature it described, so any edit
  // retires it by derivation. Clearing it from an effect instead would
  // mean a second render pass on every keystroke.
  const activeFeedback = feedback && feedback.forHtml === html ? feedback : null;

  function setStatus(message: string, forHtml: string) {
    setFeedback({ kind: "status", message, forHtml });
  }

  function setError(message: string, forHtml: string) {
    setFeedback({ kind: "error", message, forHtml });
  }

  function update<K extends keyof SignatureData>(key: K, value: SignatureData[K]) {
    setData((previous) => ({ ...previous, [key]: value }));
  }

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    setFeedback(null);
    const reader = new FileReader();
    reader.onload = () => {
      update("logoDataUrl", typeof reader.result === "string" ? reader.result : null);
      setLogoFileName(file.name);
    };
    reader.onerror = () =>
      setError("That file couldn't be read. Try a different image.", html);
    reader.readAsDataURL(file);
  }

  async function handleCopySignature() {
    const target = html;
    try {
      // Writing text/html puts the rendered signature on the clipboard so
      // it can be pasted straight into a Gmail/Outlook composer. Clients
      // and browsers without ClipboardItem fall back to the raw markup.
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([html], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(html);
      }
      setStatus("Signature copied — paste it into your mail client's signature editor.", target);
    } catch {
      setError("Copying failed. Use “Copy HTML code” and paste it manually.", target);
    }
  }

  async function handleCopyHtml() {
    const target = html;
    try {
      await navigator.clipboard.writeText(target);
      setStatus("HTML code copied.", target);
    } catch {
      setError("Copying failed — your browser blocked clipboard access.", target);
    }
  }

  async function handleDownloadPng() {
    const target = html;
    try {
      const logo = logoSrc ? await loadLogoImage(logoSrc) : null;
      if (logoSrc && !logo) {
        setError(
          "The logo couldn't be loaded for the PNG. A hosted logo needs to allow cross-origin requests — upload the file instead.",
          target,
        );
        return;
      }
      const blob = await renderSignatureBlob(
        data,
        palette,
        logo,
        scale,
        transparentMargin,
        mode,
      );
      triggerDownload(blob, buildPngFileName(data.fullName));
      setStatus(`PNG downloaded at ${scale}×.`, target);
    } catch {
      setError("Rendering the PNG failed. Try uploading the logo instead of linking it.", target);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Preview</h2>
        <div
          className="overflow-x-auto rounded-default border border-border p-4"
          // In bare mode the signature has no card of its own, so the
          // preview surface has to be the body colour it is being
          // designed against — otherwise you are judging contrast
          // against a background the recipient will never see.
          style={{
            backgroundColor: mode === "boxed" ? "#ffffff" : BARE_BACKDROPS[bareSurface],
          }}
        >
          {/*
            The preview is the generated markup itself, not a React
            re-implementation of it — what you see is byte-for-byte what
            gets copied. The HTML is built from this user's own input in
            this user's own browser (every value escaped in
            signature.ts, every colour and URL validated), and it is
            never persisted or shared.
          */}
          {blank ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-default border border-dashed border-zinc-400/60 p-8 text-center">
              <p className="text-sm text-zinc-500">
                Your signature appears here as you fill in the form.
              </p>
              <button
                type="button"
                onClick={() => setData(EXAMPLE_SIGNATURE)}
                className="rounded-default bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Load example
              </button>
            </div>
          ) : (
            <div className="min-w-max" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
        {/*
          Two groups, because the two exports have different options and
          mixing them read as "why doesn't the preview change when I click
          3×?". The scale and edge settings only ever affect the
          downloaded file — the preview above is always the HTML version.
        */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <fieldset className="flex flex-col gap-2">
            <legend className="pb-2 text-xs font-medium text-foreground/60">
              Paste into your mail client
            </legend>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={blank}
                onClick={handleCopySignature}
                className="rounded-default bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Copy signature
              </button>
              <button
                type="button"
                disabled={blank}
                onClick={handleCopyHtml}
                className={SECONDARY_BUTTON_CLASS}
              >
                Copy HTML code
              </button>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="pb-2 text-xs font-medium text-foreground/60">
              Download as an image — these settings change the file, not the preview
            </legend>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={blank}
                onClick={handleDownloadPng}
                className={SECONDARY_BUTTON_CLASS}
              >
                Download PNG
              </button>
              <span className="flex items-center gap-2 text-xs text-foreground/60">
                {PNG_SCALES.map((option) => (
                  <label key={option} className="flex items-center gap-1" title={`${option * 1200}px wide`}>
                    <input
                      type="radio"
                      name="signature-png-scale"
                      value={option}
                      checked={scale === option}
                      onChange={() => setScale(option)}
                    />
                    {option}×
                  </label>
                ))}
              </span>
              {mode === "boxed" ? (
                <label className="flex items-center gap-1.5 text-xs text-foreground/60">
                  <input
                    type="checkbox"
                    checked={transparentMargin}
                    onChange={(event) => setTransparentMargin(event.target.checked)}
                  />
                  Transparent edges
                </label>
              ) : null}
            </div>
            <p className="text-xs text-foreground/50">
              {scale}× exports at {scale * 1200}px wide.
              {mode === "boxed"
                ? transparentMargin
                  ? " The area around the rounded card stays transparent."
                  : " The area around the rounded card is filled."
                : " No background box, so the PNG is transparent."}
            </p>
          </fieldset>
        </div>
        {blank ? null : (
          <button
            type="button"
            onClick={() => setData(EMPTY_SIGNATURE)}
            className="self-start text-xs text-foreground/55 underline underline-offset-2 hover:text-foreground"
          >
            Clear all fields
          </button>
        )}
        {activeFeedback?.kind === "status" ? (
          <p role="status" className="text-sm text-foreground/70">
            {activeFeedback.message}
          </p>
        ) : null}
        {activeFeedback?.kind === "error" ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {activeFeedback.message}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 text-sm font-medium">Backdrop</legend>
          <div className="flex flex-wrap gap-3">
            {BACKDROP_OPTIONS.map((option) => (
              <label
                key={option.id}
                className="flex items-start gap-2 text-sm"
              >
                <input
                  type="radio"
                  name="signature-backdrop"
                  value={option.id}
                  checked={mode === option.id}
                  onChange={() => setMode(option.id)}
                  className="mt-1"
                />
                <span>
                  {option.label}
                  <span className="block text-xs text-foreground/55">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          {mode === "boxed" ? (
            <ColorField
              label="Background colour"
              value={backgroundInput}
              onChange={setBackgroundInput}
            />
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="pb-1.5 text-sm font-medium">Sits on</legend>
              <div className="flex flex-wrap gap-3">
                {BARE_SURFACES.map((option) => (
                  <label key={option} className="flex items-center gap-1.5 text-sm capitalize">
                    <input
                      type="radio"
                      name="signature-bare-surface"
                      value={option}
                      checked={bareSurface === option}
                      onChange={() => setBareSurface(option)}
                    />
                    {option}
                  </label>
                ))}
              </div>
              <span className="text-xs text-foreground/55">
                Never painted. It only tells the tool whether to use dark or
                light text for the email body behind your signature.
              </span>
            </fieldset>
          )}
          <ColorField label="Accent colour" value={accentInput} onChange={setAccentInput} />
        </div>

        <p className="text-xs text-foreground/55">
          Everything else — text, field labels, the divider glow and chip fills —
          is derived from these, so the signature stays readable whichever
          colours you pick.
        </p>
      </section>

      <section className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name">
          <input
            type="text"
            value={data.fullName}
            placeholder={EXAMPLE_SIGNATURE.fullName}
            onChange={(event) => update("fullName", event.target.value)}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Role" hint="Rendered in uppercase, in the accent colour.">
          <input
            type="text"
            value={data.role}
            placeholder={EXAMPLE_SIGNATURE.role}
            onChange={(event) => update("role", event.target.value)}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={data.phone}
            placeholder={EXAMPLE_SIGNATURE.phone}
            onChange={(event) => update("phone", event.target.value)}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Email" hint="Optional.">
          <input
            type="email"
            value={data.email}
            placeholder={EXAMPLE_SIGNATURE.email}
            onChange={(event) => update("email", event.target.value)}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Address" hint="One line per row.">
          <textarea
            rows={2}
            value={data.address}
            placeholder={EXAMPLE_SIGNATURE.address}
            onChange={(event) => update("address", event.target.value)}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Links" hint="One per line. Each becomes a chip.">
          <textarea
            rows={3}
            value={data.links}
            placeholder={EXAMPLE_SIGNATURE.links}
            onChange={(event) => update("links", event.target.value)}
            spellCheck={false}
            className={FIELD_CLASS}
          />
        </Field>
      </section>

      <section className="grid gap-5 sm:grid-cols-2">
        <Field label="Company" hint="Used as the mark when no logo is set.">
          <input
            type="text"
            value={data.company}
            placeholder={EXAMPLE_SIGNATURE.company}
            onChange={(event) => update("company", event.target.value)}
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Tagline" hint="Rendered in uppercase under the logo.">
          <input
            type="text"
            value={data.tagline}
            placeholder={EXAMPLE_SIGNATURE.tagline}
            onChange={(event) => update("tagline", event.target.value)}
            className={FIELD_CLASS}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Logo file</span>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              id={logoInputId}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleLogoChange}
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose logo file"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-default border border-border px-3 py-2 text-sm transition hover:border-accent"
            >
              {data.logoDataUrl ? "Change logo" : "Choose logo"}
            </button>
            {data.logoDataUrl ? (
              <button
                type="button"
                onClick={() => {
                  update("logoDataUrl", null);
                  setLogoFileName(null);
                }}
                className="text-sm text-foreground/60 underline underline-offset-2"
              >
                Remove
              </button>
            ) : null}
            {logoFileName ? (
              <span className="text-xs text-foreground/60">{logoFileName}</span>
            ) : null}
          </div>
          <span className="text-xs text-foreground/55">
            Required for the PNG export.
          </span>
        </div>

        <Field
          label="Hosted logo URL"
          hint="Optional but recommended for the HTML export — see the note below."
        >
          <input
            type="url"
            value={data.logoUrl}
            onChange={(event) => update("logoUrl", event.target.value)}
            placeholder="https://example.com/logo.png"
            spellCheck={false}
            className={FIELD_CLASS}
          />
        </Field>

        <Field label={`Logo width — ${clampLogoWidth(data.logoWidth)}px`}>
          <input
            type="range"
            min={MIN_LOGO_WIDTH}
            max={MAX_LOGO_WIDTH}
            step={4}
            value={clampLogoWidth(data.logoWidth)}
            onChange={(event) => update("logoWidth", Number(event.target.value))}
            className="w-full accent-accent"
          />
        </Field>
      </section>

      <section className="flex flex-col gap-2 rounded-default border border-border p-4 text-xs text-foreground/70">
        <p className="font-medium text-foreground/85">What actually survives in each client</p>
        <p>
          The HTML export uses tables and inline styles, which is as close to
          universal as email gets. Outlook on Windows renders through Word: it
          ignores <code>border-radius</code>, so the card and the chips come out
          square there. Everywhere else — Gmail, Apple Mail, Outlook for Mac and
          web — the rounded look holds.
        </p>
        <p>
          The PNG is pixel-identical everywhere and adds the decorative glow the
          HTML can&apos;t carry, but nothing inside it is clickable and clients
          that block images by default will show a blank box instead of your
          signature. Use it when the look matters more than the links.
        </p>
        {usesInlineLogo ? (
          <p className="text-amber-700 dark:text-amber-400">
            Your logo is embedded in the HTML as a <code>data:</code> URL. Gmail
            strips those, so recipients there will see a broken image. Host the
            logo somewhere public and paste its URL above to fix that — the PNG
            export is unaffected either way.
          </p>
        ) : null}
      </section>

      {/*
        Only the part the footer does not already cover. "Nothing is
        uploaded" is the site-wide promise; that reloading destroys work
        you have not downloaded is specific to this tool.
      */}
      <p className="text-xs text-foreground/50">
        Reloading the page clears the form with no way to recover it.
      </p>
    </div>
  );
}
