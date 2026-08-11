"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const listeners = new Set<() => void>();

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function readTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isTheme(stored) ? stored : getSystemTheme();
}

function getServerTheme(): Theme {
  return "light";
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function setTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(STORAGE_KEY, theme);
  for (const listener of listeners) listener();
}

/**
 * Manual light/dark override, persisted to localStorage. Falls back to the
 * OS `prefers-color-scheme` (handled purely in CSS) until the user picks an
 * explicit theme. Uses useSyncExternalStore rather than state+effect so the
 * client-only source (localStorage/matchMedia) is read without a hydration
 * mismatch or a synchronous setState-in-effect. The root layout's inline
 * script applies any stored override before hydration to avoid a flash of
 * the wrong theme.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, getServerTheme);

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle color theme"
      className="rounded-default border border-border px-3 py-1.5 text-sm transition hover:bg-foreground/5"
    >
      {theme === "dark" ? "Dark" : "Light"}
    </button>
  );
}
