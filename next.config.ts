import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: every tool runs entirely client-side, so no Node server
  // is needed at runtime. Deployed as static assets (e.g. on Vercel/CDN).
  output: "export",
  images: {
    // Vercel's image optimization API isn't available for static export.
    unoptimized: true,
  },
  // Don't auto-generate AGENTS.md/CLAUDE.md on `next dev` — this repo's
  // agent-facing docs are authored manually (README.md).
  agentRules: false,
};

export default nextConfig;
