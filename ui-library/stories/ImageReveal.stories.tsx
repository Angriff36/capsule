import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import PortfolioDemo from "../components/image-reveal";
import BasicDemo from "../components/image-reveal-list";

const meta: Meta = {
  title: "UI Layouts Library/Visual Effects/Image Reveal",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Image Reveal (https://ui-layouts.com/components/image-reveal): Hovering a list row reveals an image that follows the cursor with a spring.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Portfolio: Story = { render: () => <PortfolioDemo /> };
export const Basic: Story = { render: () => <BasicDemo /> };
