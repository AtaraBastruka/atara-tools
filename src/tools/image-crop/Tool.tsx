"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  applyCropDrag,
  buildDownloadFileName,
  cropBoxToRegion,
  cropRegionToBlob,
  DEFAULT_CROP_BOX,
  loadImageFromFile,
  resolveCropMimeType,
  triggerDownload,
  type CropBox,
  type CropHandle,
} from "./crop";

interface LoadedImage {
  url: string;
  element: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  fileName: string;
  mimeType: string;
}

const RESIZE_HANDLES: { id: CropHandle; label: string; className: string }[] = [
  { id: "nw", label: "Resize crop from top-left", className: "-left-1.5 -top-1.5 cursor-nwse-resize" },
  { id: "ne", label: "Resize crop from top-right", className: "-right-1.5 -top-1.5 cursor-nesw-resize" },
  { id: "sw", label: "Resize crop from bottom-left", className: "-left-1.5 -bottom-1.5 cursor-nesw-resize" },
  { id: "se", label: "Resize crop from bottom-right", className: "-right-1.5 -bottom-1.5 cursor-nwse-resize" },
];

interface DragState {
  handle: CropHandle;
  startX: number;
  startY: number;
  startBox: CropBox;
}

/**
 * Client-side image crop — free (arbitrary-rectangle) crop only in this PR;
 * aspect/shape presets and the circle mask are a later phase. Selecting a
 * file never leaves this component: there is no upload, no localStorage,
 * and no in-memory history beyond the currently-loaded image (spec:
 * image-crop domain, "No History or Recents"). Deliberately does not
 * import anything from password-generator/recents — see
 * eslint.config.mjs's `no-restricted-imports` boundary for that tool.
 */
export default function ImageCropTool() {
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [crop, setCrop] = useState<CropBox>(DEFAULT_CROP_BOX);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const fileInputId = useId();

  // Revokes the *previous* object URL as soon as `loaded` is replaced (a
  // new file chosen) and the *current* one on unmount — the only two ways
  // an image stops being displayed. Nothing else in this file ever calls
  // revokeObjectURL, so there is exactly one owner of that lifecycle.
  useEffect(() => {
    const url = loaded?.url;
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [loaded?.url]);

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
      setCrop(DEFAULT_CROP_BOX);
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
    setCrop(applyCropDrag(drag.startBox, drag.handle, dx, dy));
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  }

  async function handleDownload() {
    if (!loaded) return;
    try {
      const region = cropBoxToRegion(crop, loaded.naturalWidth, loaded.naturalHeight);
      const blob = await cropRegionToBlob(loaded.element, region, loaded.mimeType);
      const filename = buildDownloadFileName(loaded.fileName, loaded.mimeType);
      triggerDownload(blob, filename);
      setDownloaded(true);
    } catch {
      setError("Cropping that image failed. Try again, or use a different file.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor={fileInputId} className="text-sm font-medium">
          Image
        </label>
        <input
          id={fileInputId}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="text-sm"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {loaded ? (
        <>
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
            <div
              role="group"
              aria-label="Crop region"
              data-handle="move"
              onPointerDown={handlePointerDown}
              className="absolute cursor-move border-2 border-accent bg-accent/10"
              style={{
                left: `${crop.x1 * 100}%`,
                top: `${crop.y1 * 100}%`,
                width: `${(crop.x2 - crop.x1) * 100}%`,
                height: `${(crop.y2 - crop.y1) * 100}%`,
              }}
            >
              {RESIZE_HANDLES.map((handle) => (
                <div
                  key={handle.id}
                  role="button"
                  tabIndex={0}
                  aria-label={handle.label}
                  data-handle={handle.id}
                  onPointerDown={handlePointerDown}
                  className={`absolute h-3 w-3 rounded-full border-2 border-accent bg-background ${handle.className}`}
                />
              ))}
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
          Choose an image to start. Drag inside the box to move it, or drag
          a corner to resize it — free rectangular crop only for now.
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
