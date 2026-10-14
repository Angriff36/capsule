import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import AnimatedLogoDemo from "../components/footers-animated-logo";
import HoverDemo from "../components/footers-hover";

const meta: Meta = {
  title: "UI Layouts Library/Layout/Footers",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Footers (https://ui-layouts.com/components/footers): Footer layouts with an animated logo and a cursor-following gradient word.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const AnimatedLogo: Story = { render: () => <AnimatedLogoDemo /> };
export const Hover: Story = { render: () => <HoverDemo /> };
