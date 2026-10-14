import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import HorizontalDemo from "../components/progressive-carousel-horizontal";
import VerticalDemo from "../components/progressive-carousel-vertical";

const meta: Meta = {
  title: "UI Layouts Library/Media & Galleries/Progressive Carousel",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Progressive Carousel (https://ui-layouts.com/components/progressive-carousel): A carousel with progress-bar buttons that fill while a slide is shown.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Horizontal: Story = { render: () => <HorizontalDemo /> };
export const Vertical: Story = { render: () => <VerticalDemo /> };
