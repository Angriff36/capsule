import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import R3FBlob from "../components/r3f-blob";

const meta: Meta = {
  title: "UI Layouts Library/3D & Visuals/R3F Blob",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts R3F Blob: a noise-displaced blob that follows the pointer (react-three-fiber) (https://ui-layouts.com/components/r3f-blob)",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <R3FBlob /> };
