"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { generatePassword } from "./generate";
import {
  getRecentsSnapshot,
  getServerRecentsSnapshot,
  recentsStore,
  subscribeToRecents,
} from "./recents";
import { RecentsDialog } from "./RecentsDialog";

const MIN_LENGTH = 4;
const MAX_LENGTH = 128;
const DEFAULT_LENGTH = 16;

interface CharsetState {
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
}

const DEFAULT_CHARSETS: CharsetState = {
  upper: true,
  lower: true,
  digits: true,
  symbols: false,
};

const CHARSET_OPTIONS: { key: keyof CharsetState; label: string }[] = [
  { key: "upper", label: "Uppercase (A-Z)" },
  { key: "lower", label: "Lowercase (a-z)" },
  { key: "digits", label: "Digits (0-9)" },
  { key: "symbols", label: "Symbols (!@#$...)" },
];

/**
 * Password / secrets generator — a generator, never an encrypt/hash/encode
 * transform of input (see spec: secret-generator domain). Each generated
 * value is added to a generator-scoped recents list (see ./recents), viewed
 * and copied — never refilled — via RecentsDialog.
 */
export default function PasswordGeneratorTool() {
  const [length, setLength] = useState(DEFAULT_LENGTH);
  const [charsets, setCharsets] = useState<CharsetState>(DEFAULT_CHARSETS);
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [recentsOpen, setRecentsOpen] = useState(false);
  const resultId = useId();

  // Server snapshot is always [] so SSR/first client render match (no
  // hydration mismatch); the real localStorage-backed list takes over once
  // mounted (see ./recents for why this isn't plain useState+useEffect).
  const recents = useSyncExternalStore(
    subscribeToRecents,
    getRecentsSnapshot,
    getServerRecentsSnapshot,
  );

  const hasCharsetSelected = Object.values(charsets).some(Boolean);

  function toggleCharset(key: keyof CharsetState) {
    setCharsets((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleGenerate() {
    if (!hasCharsetSelected) return;
    const next = generatePassword({ length, ...charsets });
    setPassword(next);
    setCopied(false);
    recentsStore.add(next);
  }

  async function handleCopy() {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setCopied(true);
  }

  function handleClearRecents() {
    recentsStore.clear();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setRecentsOpen(true)}
          className="rounded-default border border-border px-3 py-1.5 text-sm transition hover:bg-foreground/5"
        >
          Recents{recents.length > 0 ? ` (${recents.length})` : ""}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password-length" className="text-sm font-medium">
          Length: {length}
        </label>
        <input
          id="password-length"
          type="range"
          min={MIN_LENGTH}
          max={MAX_LENGTH}
          value={length}
          onChange={(event) => setLength(Number(event.target.value))}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Characters</legend>
        {CHARSET_OPTIONS.map((option) => (
          <label key={option.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={charsets[option.key]}
              onChange={() => toggleCharset(option.key)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      {!hasCharsetSelected ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Select at least one character type to generate a password.
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!hasCharsetSelected}
        className="rounded-default bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Generate
      </button>

      <div className="flex flex-col gap-2">
        <label htmlFor={resultId} className="text-sm font-medium">
          Result
        </label>
        <div className="flex gap-2">
          <input
            id={resultId}
            type="text"
            readOnly
            value={password}
            placeholder="Click Generate to create a password"
            className="flex-1 rounded-default border border-border bg-transparent px-3 py-2 font-mono text-sm"
          />
          <button
            type="button"
            onClick={handleCopy}
            disabled={!password}
            className="rounded-default border border-border px-3 py-2 text-sm transition hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <p className="text-xs text-foreground/50">
        This generates a value locally in your browser — it never encrypts,
        hashes, or transforms anything you type, because there&apos;s
        nothing to type. It isn&apos;t a password vault, so copy your result
        somewhere safe once you&apos;re happy with it.
      </p>

      <RecentsDialog
        open={recentsOpen}
        onClose={() => setRecentsOpen(false)}
        values={recents}
        onClear={handleClearRecents}
      />
    </div>
  );
}
