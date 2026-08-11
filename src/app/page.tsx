import Link from "next/link";
import { getCategoryGroups } from "@/lib/tools-registry";

export default function Home() {
  const categoryGroups = getCategoryGroups();

  return (
    <main className="flex flex-1 flex-col gap-10 px-6 py-16">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Atara Tools</h1>
        <p className="max-w-md text-base text-foreground/70">
          A small, growing catalog of browser-based utilities. Everything
          runs entirely on your device &mdash; nothing you use here ever
          leaves your browser.
        </p>
      </div>

      {categoryGroups.length === 0 ? (
        <p className="text-center text-sm text-foreground/50">
          Tool catalog coming soon.
        </p>
      ) : (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
          {categoryGroups.map((group) => (
            <section key={group.category} className="flex flex-col gap-4">
              <h2 className="text-lg font-medium tracking-tight">
                {group.label}
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2">
                {group.tools.map((entry) => (
                  <li key={entry.manifest.slug}>
                    <Link
                      href={`/tools/${entry.manifest.slug}`}
                      className="block rounded-default border border-border p-4 transition hover:border-accent"
                    >
                      <h3 className="font-medium">{entry.manifest.title}</h3>
                      <p className="mt-1 text-sm text-foreground/70">
                        {entry.manifest.description}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
