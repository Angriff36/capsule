import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url))
  .replace(/\\/g, "/")
  .replace(/\/$/, "")
  .toLowerCase();

/** Folders under this checkout that are never story source. */
const NOT_WATCHED = [
  "/.git",
  "/node_modules",
  "/.loop-worktrees",
  "/.convex",
  "/.ralph-tasks",
  "/.artifacts",
  "/.builder",
  "/generated",
  "/docs",
  "/output",
  "/tests",
];

/**
 * Storybook for the Capsule design system.
 *
 * It deliberately does NOT define its own tokens or component CSS. The stories
 * import `src/styles/app.css` — the same file the app boots with, and the same
 * file `scripts/check-design-vocab.ts` gates against DESIGN.md. If a token
 * changes in app.css, every story here changes with it. There is no second
 * copy of the design system to drift.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: { name: "@storybook/react-vite", options: {} },
  core: { disableTelemetry: true },
  docs: { defaultName: "Docs" },
  viteFinal: async (viteConfig) => {
    // The app's vite.config.ts carries Convex/Clerk dev middleware Storybook
    // has no use for, so we add only the one plugin the styles need.
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];
    // Watch only this checkout's own source. Without this the watcher held
    // ~125,000 files open (2026-09-30): every builder copy under
    // .loop-worktrees with its packages, the local Convex database, task and
    // report folders. That starved the whole computer of memory. The check
    // ignores letter case: Windows opens this repo as both C:\projects and
    // C:\Projects, and a case-sensitive pattern missed half of it.
    viteConfig.server = {
      ...viteConfig.server,
      watch: {
        ...viteConfig.server?.watch,
        ignored: (file: string) => {
          const relative = file
            .replace(/\\/g, "/")
            .toLowerCase()
            .slice(root.length);
          return NOT_WATCHED.some(
            (dir) => relative === dir || relative.startsWith(`${dir}/`),
          );
        },
      },
    };
    return viteConfig;
  },
};

export default config;
