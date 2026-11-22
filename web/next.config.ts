import type { NextConfig } from "next";

// Most pages are static. Player profiles are prerendered only for ranked players; every other profile renders
// on its first request and is then cached (ISR), reading its JSON from public/data/players. Match detail and
// the search list are plain JSON files fetched by the browser.
const nextConfig: NextConfig = {
  trailingSlash: true,
  // the profile route reads its player's JSON from disk at request time, so ship those files with the function
  outputFileTracingIncludes: {
    "/players/*/*": ["./public/data/players/**/*.json", "./data/*.json"],
  },
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
