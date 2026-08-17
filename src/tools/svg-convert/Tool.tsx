"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  buildDownloadFileName,
  DEFAULT_FORMAT,
  DEFAULT_SCALE,
  mimeTypeForFormat,
  OUTPUT_FORMATS,
  parseSvgIntrinsicSize,
  rasterizeSvgToBlob,
  readSvgTextFromFile,
  resolveOutputSize,
  SCALE_PRESETS,
  triggerDownload,
  type OutputFormat,
  type ScalePreset,
  type SvgIntrinsicSize,
} from "./convert";

interface LoadedSvg {
  text: string;
  url: string;
  fileName: string;
  intrinsic: SvgIntrinsicSize;
}

/**
 * Client-side SVG → PNG/WebP conversion. Selecting a file never leaves
 * this component: there is no upload, no localStorage, and no in-memory
 * history beyond the currently-loaded SVG. Deliberately does not import
 * anything from password-generator/recents — see eslint.config.mjs's
 * `no-restricted-imports` boundary.
 */
export default function SvgConvertTool() {
  const [loaded, setLoaded] = useState<LoadedSvg | null>(null);
  const [format, setFormat] = useState<OutputFormat>(DEFAULT_FORMAT);
  const [scale, setScale] = useState<ScalePreset>(DEFAULT_SCALE);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewGenRef = useRef(0);
  const fileInputId = useId();

  const outputSize = loaded ? resolveOutputSize(loaded.intrinsic, scale) : null;
  const outputWidth = outputSize?.width;
  const outputHeight = outputSize?.height;
  const outputMimeType = mimeTypeForFormat(format);

  useEffect(() => {
    const url = loaded?.url;
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [loaded?.url]);

  useEffect(() => {
    if (!loaded || outputWidth == null || outputHeight == null) return;

    let cancelled = false;
    const generation = ++previewGenRef.current;

    rasterizeSvgToBlob(loaded.text, outputWidth, outputHeight, outputMimeType)
      .then((blob) => {
        if (cancelled || generation !== previewGenRef.current) return;
        const nextUrl = URL.createObjectURL(blob);
        setPreviewUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return nextUrl;
        });
      })
      .catch(() => {
        if (cancelled || generation !== previewGenRef.current) return;
        setPreviewUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return null;
        });
      });

    return () => {
      cancelled = true;
      previewGenRef.current += 1;
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    };
  }, [loaded, outputWidth, outputHeight, outputMimeType]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    setError(null);
    try {
      const text = await readSvgTextFromFile(file);
      const url = URL.createObjectURL(file);
      setLoaded({
        text,
        url,
        fileName: file.name,
        intrinsic: parseSvgIntrinsicSize(text),
      });
      setDownloaded(false);
    } catch {
      setError("That file couldn't be read as an SVG. Try a different one.");
    }
  }

  async function handleDownload() {
    if (!loaded || !outputSize) return;
    try {
      const blob = await rasterizeSvgToBlob(
        loaded.text,
        outputSize.width,
        outputSize.height,
        outputMimeType,
      );
      triggerDownload(blob, buildDownloadFileName(loaded.fileName, outputMimeType));
      setDownloaded(true);
    } catch {
      setError("Converting that SVG failed. Try again, or use a different file.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">SVG</span>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept="image/svg+xml,.svg"
            onChange={handleFileChange}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose SVG file"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-default bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            {loaded ? "Choose another SVG" : "Choose SVG"}
          </button>
          {loaded ? <span className="text-sm text-foreground/70">{loaded.fileName}</span> : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {loaded && outputSize ? (
        <>
          <div className="flex flex-wrap gap-6">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Format</legend>
              <div className="flex flex-wrap gap-3">
                {OUTPUT_FORMATS.map((option) => (
                  <label key={option.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="svg-output-format"
                      value={option.id}
                      checked={format === option.id}
                      onChange={() => {
                        setFormat(option.id);
                        setDownloaded(false);
                      }}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Scale</legend>
              <div className="flex flex-wrap gap-3">
                {SCALE_PRESETS.map((preset) => (
                  <label key={preset} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="svg-output-scale"
                      value={preset}
                      checked={scale === preset}
                      onChange={() => {
                        setScale(preset);
                        setDownloaded(false);
                      }}
                    />
                    {preset}×
                  </label>
                ))}
              </div>
              <p className="text-xs text-foreground/60">
                Source {Math.round(loaded.intrinsic.width)} × {Math.round(loaded.intrinsic.height)}{" "}
                → {outputSize.width} × {outputSize.height} px
              </p>
            </fieldset>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="text-sm font-medium">Original</span>
              <div
                className="flex min-h-32 items-center justify-center rounded-default border border-border p-3"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, #e4e4e7 25%, transparent 25%, transparent 75%, #e4e4e7 75%, #e4e4e7), linear-gradient(45deg, #e4e4e7 25%, transparent 25%, transparent 75%, #e4e4e7 75%, #e4e4e7)",
                  backgroundSize: "16px 16px",
                  backgroundPosition: "0 0, 8px 8px",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL for a user-picked SVG */}
                <img
                  src={loaded.url}
                  alt="Selected SVG"
                  className="max-h-48 max-w-full object-contain"
                />
              </div>
            </div>

            <div className="flex w-full shrink-0 flex-col gap-2 lg:w-56">
              <span className="text-sm font-medium">Preview</span>
              <p className="text-xs text-foreground/60">This is exactly what downloads.</p>
              <div
                className="flex min-h-32 items-center justify-center rounded-default border border-border p-3"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, #e4e4e7 25%, transparent 25%, transparent 75%, #e4e4e7 75%, #e4e4e7), linear-gradient(45deg, #e4e4e7 25%, transparent 25%, transparent 75%, #e4e4e7 75%, #e4e4e7)",
                  backgroundSize: "16px 16px",
                  backgroundPosition: "0 0, 8px 8px",
                }}
              >
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- live canvas export preview
                  <img
                    src={previewUrl}
                    alt="Converted preview"
                    className="max-h-48 max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-foreground/50">Updating preview…</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-default bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Download {format === "webp" ? "WebP" : "PNG"}
            </button>
            {downloaded ? <span className="text-sm text-foreground/70">Downloaded.</span> : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-foreground/70">
          Choose an SVG to start. Pick PNG or WebP and a scale, then download
          — the preview is the exact raster that will be saved.
        </p>
      )}

      <p className="text-xs text-foreground/50">
        Everything happens locally in your browser: the SVG is never
        uploaded, and nothing about it — not even that you opened this tool
        — is stored anywhere. Reloading the page loses any conversion you
        haven&apos;t downloaded yet, with no way to recover it.
      </p>
    </div>
  );
}
