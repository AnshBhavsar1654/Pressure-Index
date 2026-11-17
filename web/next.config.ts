import type { NextConfig } from "next";

// Fully static site: every page (including one per player) is prerendered at build time
// from the JSON in ./data, so the output in ./out can be hosted anywhere.
const nextConfig: NextConfig = {
  output: "export",
  // 1,200+ pages build in parallel; a few large ones (compare, profiles) can exceed the 60 s default on a cold worker
  staticPageGenerationTimeout: 180,
  trailingSlash: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
