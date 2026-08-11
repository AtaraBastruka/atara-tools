import { notFound } from "next/navigation";
import { ToolShell } from "@/components/shell/ToolShell";
import { getAllSlugs, getToolBySlug, getToolComponent } from "@/lib/tools-registry";

// `output: 'export'` requires generateStaticParams() to return at least one
// path, or the build fails outright (Next.js: "at least one route must be
// generated"). With an empty catalog — PR2 ships before any tool is
// registered — fall back to a single reserved placeholder slug. It can
// never collide with a real tool (registry slugs are plain kebab-case) and
// the page below resolves it to notFound(), same as any other unknown slug.
// This is Next.js's own documented workaround for a build-time-empty
// dynamic route under static export.
export function generateStaticParams() {
  const slugs = getAllSlugs();
  return slugs.length > 0 ? slugs.map((slug) => ({ slug })) : [{ slug: "__placeholder__" }];
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getToolBySlug(slug);
  const Tool = getToolComponent(slug);

  if (!entry || !Tool) {
    notFound();
  }

  return (
    <ToolShell title={entry.manifest.title} description={entry.manifest.description}>
      {/*
        getToolComponent returns a component memoized once at module scope
        in the registry (see src/lib/tools-registry.ts) — it is never
        created fresh per render. This is also a Server Component with no
        hook state to reset, so the lint rule's "created during render"
        concern doesn't apply here.
      */}
      {/* eslint-disable-next-line react-hooks/static-components */}
      <Tool />
    </ToolShell>
  );
}
