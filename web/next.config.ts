import type { NextConfig } from "next";

// Fully static site: every page (including one per player) is prerendered at build time
// from the JSON in ./data, so the output in ./out can be hosted anywhere.
const nextConfig: NextConfig = {
  output: "export",
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
