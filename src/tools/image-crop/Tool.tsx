"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  applyCropDrag,
  buildDownloadFileName,
  constrainBoxToAspect,
  cropBoxToRegion,
  cropRegionToBlob,
  DEFAULT_CROP_BOX,
  loadImageFromFile,
  resolveCropMimeType,
  triggerDownload,
  type CropBox,
  type CropHandle,
} from "./crop";
import {
  CROP_ASPECT_PRESETS,
  CROP_SHAPE_PRESETS,
  isAspectPresetDisabled,
  resolveAspectRatio,
  roundedRectCornerRadius,
  shapeRequiresPngOutput,
  type CropAspectPresetId,
  type CropShapePresetId,
} from "./presets";

interface LoadedImage {
  url: string;
  element: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  fileName: string;
  mimeType: string;
}

const CORNER_HANDLES: { id: CropHandle; label: string; className: string }[] = [
  { id: "nw", label: "Resize crop from top-left", className: "-left-2 -top-2 cursor-nwse-resize" },
  { id: "ne", label: "Resize crop from top-right", className: "-right-2 -top-2 cursor-nesw-resize" },
  { id: "sw", label: "Resize crop from bottom-left", className: "-left-2 -bottom-2 cursor-nesw-resize" },
  { id: "se", label: "Resize crop from bottom-right", className: "-right-2 -bottom-2 cursor-nwse-resize" },
];

const EDGE_HANDLES: { id: CropHandle; label: string; className: string }[] = [
  { id: "n", label: "Resize crop from top edge", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize" },
  { id: "s", label: "Resize crop from bottom edge", className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize" },
  { id: "e", label: "Resize crop from right edge", className: "right-0 top-1/2 -translate-y-1/2 translate-x-1/2 cursor-ew-resize" },
  { id: "w", label: "Resize crop from left edge", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize" },
];

function CropDimOverlay({
  crop,
  shape,
  maskId,
}: {
  crop: CropBox;
  shape: CropShapePresetId;
  maskId: string;
}) {
  const x1 = crop.x1 * 100;
  const y1 = crop.y1 * 100;
  const width = (crop.x2 - crop.x1) * 100;
  const height = (crop.y2 - crop.y1) * 100;
  const cx = x1 + width / 2;
  const cy = y1 + height / 2;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <defs>
        <mask id={maskId}>
          <rect width="100" height="100" fill="white" />
          {shape === "circle" ? (
            <ellipse cx={cx} cy={cy} rx={width / 2} ry={height / 2} fill="black" />
          ) : shape === "rounded-rectangle" ? (
            <rect
              x={x1}
              y={y1}
              width={width}
              height={height}
              rx={roundedRectCornerRadius(width, height)}
              ry={roundedRectCornerRadius(width, height)}
              fill="black"
            />
          ) : (
            <rect x={x1} y={y1} width={width} height={height} fill="black" />
          )}
        </mask>
      </defs>
      <rect width="100" height="100" fill="rgba(0,0,0,0.55)" mask={`url(#${maskId})`} />
    </svg>
  );
}

interface DragState {
  handle: CropHandle;
  startX: number;
  startY: number;
  startBox: CropBox;
}

/**
 * Client-side image crop — free (arbitrary-rectangle) crop plus aspect
 * (free/1:1/4:3/16:9/9:16) and shape (rectangle/circle) presets (spec:
 * image-crop domain; locked decision #4 in tasks). Selecting a file never
 * leaves this component: there is no upload, no localStorage, and no
 * in-memory history beyond the currently-loaded image and the currently
 * selected presets (spec: image-crop domain, "No History or Recents").
 * Deliberately does not import anything from password-generator/recents —
 * see eslint.config.mjs's `no-restricted-imports` boundary for that tool.
 */
export default function ImageCropTool() {
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [crop, setCrop] = useState<CropBox>(DEFAULT_CROP_BOX);
  const [aspect, setAspect] = useState<CropAspectPresetId>("free");
  const [shape, setShape] = useState<CropShapePresetId>("rectangle");
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const previewGenRef = useRef(0);
  const fileInputId = useId();
  const overlayMaskId = useId();

  // Recomputed every render from the two preset selections rather than
  // stored itself — keeps "circle forces 1:1" a pure function of state
  // instead of a second place that can drift out of sync with it.
  const aspectRatio = resolveAspectRatio(shape, aspect);

  // Revokes the *previous* object URL as soon as `loaded` is replaced (a
  // new file chosen) and the *current* one on unmount — the only two ways
  // an image stops being displayed. Nothing else in this file ever calls
  // revokeObjectURL, so there is exactly one owner of that lifecycle.
  useEffect(() => {
    const url = loaded?.url;
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [loaded?.url]);

  // Live preview of the exact download output — updates as the crop box,
  // aspect preset, or shape changes so the user sees the final result.
  useEffect(() => {
    if (!loaded) return;

    let cancelled = false;
    const generation = ++previewGenRef.current;
    const region = cropBoxToRegion(crop, loaded.naturalWidth, loaded.naturalHeight);
    const outputMimeType = shapeRequiresPngOutput(shape) ? "image/png" : loaded.mimeType;

    cropRegionToBlob(loaded.element, region, outputMimeType, shape)
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
  }, [loaded, crop, shape]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    // Reset the input so choosing the same file again still fires onChange.
    event.target.value = "";
    if (!file) return;

    setError(null);
    try {
      const { image, url } = await loadImageFromFile(file);
      setLoaded({
        url,
        element: image,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        fileName: file.name,
        mimeType: resolveCropMimeType(file.type),
      });
      // A preset chosen before this image was selected still applies to it.
      setCrop(constrainBoxToAspect(DEFAULT_CROP_BOX, aspectRatio));
      setDownloaded(false);
    } catch {
      setError("That file couldn't be read as an image. Try a different one.");
    }
  }

  // A single flat handler (reading which handle was grabbed from a data
  // attribute) rather than a curried `handlePointerDown(handle) => (event)
  // => ...` factory — the curried form calls into the component body to
  // produce each handler during render, which trips the
  // `react-hooks/refs` lint rule's "ref access during render" check even
  // though the actual ref write only ever runs later, from the returned
  // event handler.
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const handle = event.currentTarget.dataset.handle as CropHandle | undefined;
    if (!handle) return;
    event.preventDefault();
    // A corner handle sits (visually and in the DOM) inside the move
    // region, and both share this same handler — without stopping
    // propagation here, a pointerdown on a corner handle bubbles up to the
    // move region's own onPointerDown right after, which would overwrite
    // dragRef.current's handle back to "move" and silently turn every
    // resize drag into a move. Discovered while adding PR6's aspect-lock
    // resize tests, which are the first tests to drive a corner handle
    // through the rendered UI rather than calling applyCropDrag directly;
    // this bug predates PR6 and affected free-crop corner resizing too.
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { handle, startX: event.clientX, startY: event.clientY, startBox: crop };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const image = imageRef.current;
    if (!drag || !image) return;

    const rect = image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dx = (event.clientX - drag.startX) / rect.width;
    const dy = (event.clientY - drag.startY) / rect.height;
    setCrop(applyCropDrag(drag.startBox, drag.handle, dx, dy, aspectRatio));
  }

  function handleAspectChange(id: CropAspectPresetId) {
    if (isAspectPresetDisabled(shape, id)) return;
    setAspect(id);
    setCrop((previous) => constrainBoxToAspect(previous, resolveAspectRatio(shape, id)));
  }

  function handleShapeChange(id: CropShapePresetId) {
    setShape(id);
    // Locked decision: circle forces 1:1 and disables every other aspect choice.
    const nextAspect = id === "circle" ? "1:1" : aspect;
    setAspect(nextAspect);
    setCrop((previous) => constrainBoxToAspect(previous, resolveAspectRatio(id, nextAspect)));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  }

  async function handleDownload() {
    if (!loaded) return;
    try {
      const region = cropBoxToRegion(crop, loaded.naturalWidth, loaded.naturalHeight);
      // Circle always exports PNG (needs alpha for the transparent corners);
      // rectangle keeps whatever format the source file resolved to (PR5,
      // unchanged) — task 6.6.
      const outputMimeType = shapeRequiresPngOutput(shape) ? "image/png" : loaded.mimeType;
      const blob = await cropRegionToBlob(loaded.element, region, outputMimeType, shape);
      const filename = buildDownloadFileName(loaded.fileName, outputMimeType);
      triggerDownload(blob, filename);
      setDownloaded(true);
    } catch {
      setError("Cropping that image failed. Try again, or use a different file.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Image</span>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose image file"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-default bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            {loaded ? "Choose another image" : "Choose image"}
          </button>
          {loaded ? (
            <span className="text-sm text-foreground/70">{loaded.fileName}</span>
          ) : null}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {loaded ? (
        <>
          <div className="flex flex-wrap gap-6">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Aspect ratio</legend>
              <div className="flex flex-wrap gap-3">
                {CROP_ASPECT_PRESETS.map((preset) => (
                  <label key={preset.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="crop-aspect"
                      value={preset.id}
                      checked={aspect === preset.id}
                      disabled={isAspectPresetDisabled(shape, preset.id)}
                      onChange={() => handleAspectChange(preset.id)}
                    />
                    {preset.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Shape</legend>
              <div className="flex flex-wrap gap-3">
                {CROP_SHAPE_PRESETS.map((preset) => (
                  <label key={preset.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="crop-shape"
                      value={preset.id}
                      checked={shape === preset.id}
                      onChange={() => handleShapeChange(preset.id)}
                    />
                    {preset.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div
              className="relative inline-block max-w-full touch-none select-none"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL for a user-picked file, never a remote/optimizable src */}
              <img
                ref={imageRef}
                src={loaded.url}
                alt="Selected for cropping"
                className="block max-h-[60vh] max-w-full"
              />
              <CropDimOverlay crop={crop} shape={shape} maskId={overlayMaskId} />
              <div
                role="group"
                aria-label="Crop region"
                data-handle="move"
                onPointerDown={handlePointerDown}
                className={`absolute cursor-move border-2 border-accent bg-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.35)_inset] ${
                  shape === "circle"
                    ? "rounded-full"
                    : shape === "rounded-rectangle"
                      ? "rounded-[12%]"
                      : ""
                }`}
                style={{
                  left: `${crop.x1 * 100}%`,
                  top: `${crop.y1 * 100}%`,
                  width: `${(crop.x2 - crop.x1) * 100}%`,
                  height: `${(crop.y2 - crop.y1) * 100}%`,
                }}
              >
                {CORNER_HANDLES.map((handle) => (
                  <div
                    key={handle.id}
                    role="button"
                    tabIndex={0}
                    aria-label={handle.label}
                    data-handle={handle.id}
                    onPointerDown={handlePointerDown}
                    className={`absolute h-4 w-4 rounded-full border-2 border-accent bg-background shadow-sm ${handle.className}`}
                  />
                ))}
                {!aspectRatio
                  ? EDGE_HANDLES.map((handle) => (
                      <div
                        key={handle.id}
                        role="button"
                        tabIndex={0}
                        aria-label={handle.label}
                        data-handle={handle.id}
                        onPointerDown={handlePointerDown}
                        className={`absolute h-4 w-4 rounded-full border-2 border-accent bg-background shadow-sm ${handle.className}`}
                      />
                    ))
                  : null}
              </div>
            </div>

            <div className="flex w-full shrink-0 flex-col gap-2 lg:w-56">
              <span className="text-sm font-medium">Preview</span>
              <p className="text-xs text-foreground/60">
                This is exactly what downloads — including transparent corners on
                rounded or circle shapes.
              </p>
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
                    alt="Crop preview"
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
              Download crop
            </button>
            {downloaded ? <span className="text-sm text-foreground/70">Downloaded.</span> : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-foreground/70">
          Choose an image to start. Drag inside the box to move it, drag corners
          or edges (in Free mode) to resize, and watch the preview update as you
          go — pick an aspect ratio or circle shape once your image is loaded.
        </p>
      )}

      <p className="text-xs text-foreground/50">
        Everything happens locally in your browser: the image is never
        uploaded, and nothing about it — not even that you opened this tool
        — is stored anywhere. Reloading the page loses any crop you
        haven&apos;t downloaded yet, with no way to recover it.
      </p>
    </div>
  );
}
