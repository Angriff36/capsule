import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import ImageRippleEffect from "../components/image-ripple-effect";

const meta: Meta = {
  title: "UI Layouts Library/3D & Visuals/Image Ripple Effect",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Image Ripple Effect: pointer trails ripple three images through a displacement shader. Move the mouse over the canvas (https://ui-layouts.com/components/image-ripple-effect)",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <ImageRippleEffect /> };
