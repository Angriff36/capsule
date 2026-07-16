import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { port: 7811, strictPort: true },
  preview: { port: 7811, strictPort: true },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: ".artifacts/coverage",
      include: ["src/app/auth/**", "src/app/navigation/**"],
      thresholds: {
        // Ratchet only upward. Measured 2026-07-16 on membership + nav catalog.
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 100,
      },
    },
  },
});
