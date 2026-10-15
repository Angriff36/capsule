import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import DragItems from "../components/drag-items";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Drag Items",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Drag Items (https://ui-layouts.com/components/drag-items): a list you reorder by dragging the grip handle, with a raised shadow while held.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <DragItems /> };
