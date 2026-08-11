"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Minimal accessible modal dialog primitive: `role="dialog"` + `aria-modal`,
 * renders nothing while closed, moves focus into itself on open and
 * restores the previously focused element on close, and closes on Escape
 * or a backdrop click. Deliberately not built on the native `<dialog>`
 * element's `showModal()`/`close()` — those aren't implemented by this
 * project's jsdom test environment, which would make it untestable.
 * Generic on purpose: recents-specific content and copy live in
 * `RecentsDialog`, not here.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    return () => {
      previouslyFocused.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex w-full max-w-md flex-col gap-4 rounded-default border border-border bg-background p-6 text-foreground outline-none"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-default border border-border px-2 py-1 text-sm transition hover:bg-foreground/5"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
