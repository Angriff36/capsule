import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import DefaultDemo from "../components/blocks-demo";

const meta: Meta = {
  title: "UI Layouts Library/Visual Effects/Blocks",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Blocks (https://ui-layouts.com/components/blocks): A grid of blocks used as an interactive background, with highlighted blocks you choose.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <DefaultDemo /> };
