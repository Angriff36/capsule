import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

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
    return viteConfig;
  },
};

export default config;
