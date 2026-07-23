import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Watch ignores: Vite defaults watch the whole repo. Edits under docs/,
 * .gitattributes, .pw-verify/, etc. were triggering full client page reloads
 * ("constantly refreshing"). Only source that can affect the app bundle
 * should invalidate the client.
 */
const watchIgnored = [
  "**/.git/**",
  "**/.artifacts/**",
  "**/.aboardai/**",
  "**/.builder/**",
  "**/.pw-verify/**",
  "**/.playwright-mcp/**",
  "**/.loop-worktrees/**",
  "**/docs/**",
  "**/diagrams/**",
  "**/output/**",
  "**/generated/**",
  "**/scripts/**",
  "**/convex/lib/**",
  "**/package.json",
  "**/.gitattributes",
  "**/.gitignore",
  "**/PRODUCT-BACKLOG.md",
  "**/loop-ledger.json",
  "**/loop-run-log.md",
  "**/AGENTS.md",
  "**/CLAUDE.md",
];

export default defineConfig({
  // host: true → listen on 0.0.0.0 so both http://localhost:7811 and
  // http://127.0.0.1:7811 work. Pinning only 127.0.0.1 broke "localhost";
  // pinning nothing on Windows sometimes bound ::1 only.
  server: {
    host: true,
    port: 7811,
    strictPort: true,
    watch: { ignored: watchIgnored },
  },
  preview: {
    host: true,
    port: 7811,
    strictPort: true,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    environmentMatchGlobs: [["tests/proofs/**", "edge-runtime"]],
    server: { deps: { inline: ["convex-test"] } },
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
