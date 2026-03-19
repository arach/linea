import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
      // @arach/ora bundles server-only code that imports Node built-ins
      // (crypto, child_process, fs, etc.) which break in the browser.
      // Replace with a local re-export of just the browser-safe parts.
      "@arach/ora": path.resolve(rootDir, "src/lib/ora-browser.ts"),
    },
  },
});
