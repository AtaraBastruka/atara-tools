import type { ComponentType } from "react";

export type ToolCategory = "content" | "image" | "security";

export interface ToolManifest {
  slug: string;
  title: string;
  description: string;
  category: ToolCategory;
}

export interface ToolEntry {
  manifest: ToolManifest;
  // Loader for the tool's UI. Registry entries must use a literal dynamic
  // import() path — never interpolate a slug into import() — so the module
  // graph stays closed to arbitrary strings and each tool ships its own chunk.
  load: () => Promise<{ default: ComponentType }>;
}

export interface CategoryGroup {
  category: ToolCategory;
  label: string;
  tools: ToolEntry[];
}
