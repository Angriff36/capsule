import React from "react";
import type { Preview } from "@storybook/react-vite";
import "@fontsource-variable/dm-sans";
import "@fontsource/ibm-plex-mono";
import "../src/styles/app.css";

/**
 * The app sets `.dark` on <html> pre-paint from stored preference. Stories do
 * the same thing via the Scheme toolbar so every component is checked in both
 * schemes without a second set of tokens.
 */
const preview: Preview = {
  parameters: {
    layout: "padded",
    controls: { expanded: true },
    backgrounds: { disable: true },
    options: {
      storySort: {
        order: [
          "Overview",
          "Foundations",
          ["Colour", "Typography", "Radius & Spacing"],
          "Controls",
          "Document grammar",
          "Primitives",
          "Charts",
          "Compositions",
        ],
      },
    },
  },
  globalTypes: {
    scheme: {
      description: "Colour scheme",
      toolbar: {
        title: "Scheme",
        icon: "mirror",
        items: [
          { value: "light", title: "Paper (default)" },
          { value: "dark", title: "Lamplight (.dark)" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { scheme: "light" },
  decorators: [
    (Story, context) => {
      const dark = context.globals.scheme === "dark";
      React.useEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        document.body.style.background = "var(--color-canvas)";
        document.body.style.color = "var(--color-ink)";
      }, [dark]);
      return (
        <div className="bg-canvas text-ink font-sans" style={{ padding: 24 }}>
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
