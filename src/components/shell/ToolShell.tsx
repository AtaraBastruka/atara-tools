/**
 * Per-tool chrome: title, description, and an optional action bar. The
 * content slot is otherwise unconstrained — a tool owns its own layout,
 * scroll behavior, and interactions inside it.
 */
export function ToolShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-10">
      <header className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 max-w-xl text-sm text-foreground/70">{description}</p>
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1">{children}</div>
    </section>
  );
}
