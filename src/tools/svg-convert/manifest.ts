import type { ToolManifest } from "@/lib/types";

export const svgConvertManifest: ToolManifest = {
  slug: "svg-convert",
  title: "SVG Convert",
  description:
    "Turn a local SVG into a PNG or WebP and download the result. Nothing is uploaded, and nothing about the conversion is kept.",
  category: "image",
};
