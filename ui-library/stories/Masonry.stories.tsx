import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import DefaultDemo from "../components/masonary-grid";

const meta: Meta = {
  title: "UI Layouts Library/Layout/Masonry",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Masonry (https://ui-layouts.com/components/masonary-grid): A masonry image grid that fades items in as they scroll into view.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <DefaultDemo /> };
