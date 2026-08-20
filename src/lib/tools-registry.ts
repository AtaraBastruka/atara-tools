import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { emailSignatureManifest } from "@/tools/email-signature/manifest";
import { imageCropManifest } from "@/tools/image-crop/manifest";
import { mdToPdfManifest } from "@/tools/md-to-pdf/manifest";
import { passwordGeneratorManifest } from "@/tools/password-generator/manifest";
import { svgConvertManifest } from "@/tools/svg-convert/manifest";
import type { CategoryGroup, ToolCategory, ToolEntry } from "./types";

const CATEGORY_LABELS: Record<ToolCategory, string> = {
  image: "Image",
  content: "Content",
  security: "Security",
};

const CATEGORY_ORDER: ToolCategory[] = ["image", "content", "security"];

// Single source of truth for the catalog, nav, and `/tools/[slug]` routes.
// Add one entry per tool folder here, loading its UI via a literal dynamic
// import() path (see src/lib/types.ts).
export const TOOLS: ToolEntry[] = [
  {
    manifest: imageCropManifest,
    load: () => import("@/tools/image-crop/Tool"),
  },
  {
    manifest: svgConvertManifest,
    load: () => import("@/tools/svg-convert/Tool"),
  },
  {
    manifest: emailSignatureManifest,
    load: () => import("@/tools/email-signature/Tool"),
  },
  {
    manifest: mdToPdfManifest,
    load: () => import("@/tools/md-to-pdf/Tool"),
  },
  {
    manifest: passwordGeneratorManifest,
    load: () => import("@/tools/password-generator/Tool"),
  },
];

/**
 * Groups tools by category, in display order. A category with no tools
 * simply never gets an entry in the intermediate map, so it's absent from
 * the result by construction — there is no "count > 0" check to get wrong.
 */
export function deriveCategoryGroups(tools: ToolEntry[]): CategoryGroup[] {
  const toolsByCategory = new Map<ToolCategory, ToolEntry[]>();

  for (const entry of tools) {
    const existing = toolsByCategory.get(entry.manifest.category);
    if (existing) {
      existing.push(entry);
    } else {
      toolsByCategory.set(entry.manifest.category, [entry]);
    }
  }

  return CATEGORY_ORDER.filter((category) => toolsByCategory.has(category)).map(
    (category) => ({
      category,
      label: CATEGORY_LABELS[category],
      tools: toolsByCategory.get(category) as ToolEntry[],
    }),
  );
}

export function getCategoryGroups(): CategoryGroup[] {
  return deriveCategoryGroups(TOOLS);
}

export function getToolBySlug(slug: string): ToolEntry | undefined {
  return TOOLS.find((entry) => entry.manifest.slug === slug);
}

export function getAllSlugs(): string[] {
  return TOOLS.map((entry) => entry.manifest.slug);
}

// Each tool's UI is wrapped in next/dynamic exactly once, here, at module
// scope — never inside a page's render — so its chunk is created once per
// entry rather than freshly on every render.
const toolComponents = new Map<string, ComponentType>(
  TOOLS.map((entry) => [entry.manifest.slug, dynamic(entry.load)] as const),
);

export function getToolComponent(slug: string): ComponentType | undefined {
  return toolComponents.get(slug);
}
