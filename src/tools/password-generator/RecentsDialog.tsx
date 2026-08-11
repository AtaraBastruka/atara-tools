"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";

/**
 * Copy-only recents view (locked decision: no click-to-refill — see spec:
 * recents domain, "bare-values dialog/modal with no extra context"). Values
 * are only ever displayed and copied here; clearing and generating happen
 * outside this component (see Tool.tsx), which owns the underlying store.
 */
export function RecentsDialog({
  open,
  onClose,
  values,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  values: string[];
  onClear: () => void;
}) {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  async function handleCopy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedValue(value);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Recents">
      <div className="flex flex-col gap-4">
        {values.length === 0 ? (
          <p className="text-sm text-foreground/70">
            Nothing generated yet.
          </p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {values.map((value, index) => (
              <li key={`${index}-${value}`} className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-default border border-border bg-transparent px-3 py-2 font-mono text-sm">
                  {value}
                </code>
                <button
                  type="button"
                  onClick={() => handleCopy(value)}
                  className="shrink-0 rounded-default border border-border px-3 py-2 text-sm transition hover:bg-foreground/5"
                >
                  {copiedValue === value ? "Copied" : "Copy"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onClear}
          disabled={values.length === 0}
          className="self-start rounded-default border border-border px-3 py-2 text-sm transition hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear all
        </button>

        <p className="text-xs text-foreground/50">
          These are the actual values you&apos;ve generated recently, kept
          only in this browser&apos;s local storage. This isn&apos;t a
          password vault: it isn&apos;t encrypted, isn&apos;t backed up, and
          disappears the moment you clear it above or clear this
          site&apos;s data in your browser.
        </p>
      </div>
    </Dialog>
  );
}
