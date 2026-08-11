import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Persistent chrome wrapping every route: branding, primary nav, and the
 * theme toggle. Stays mounted across navigation; never reaches into or
 * constrains whatever a tool renders inside it.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <nav
          aria-label="Primary"
          className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4"
        >
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Atara Tools
          </Link>
          <ThemeToggle />
        </nav>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="border-t border-border px-6 py-4 text-center text-xs text-foreground/50">
        Everything here runs locally in your browser. Nothing is uploaded.
      </footer>
    </div>
  );
}
