import type { Decorator } from "@storybook/react-vite";
import "./library.css";

/** Wraps a library story on Capsule's canvas with the library's styles. */
export const libraryFrame: Decorator = (Story) => (
  <div className="uil-root min-h-40 rounded-md bg-background p-6 font-sans text-foreground">
    <Story />
  </div>
);
