import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import GenieEffect from "../components/mac-genie";

const meta: Meta = {
  title: "UI Layouts Library/Visual Effects/Mac Genie",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Mac Genie (https://ui-layouts.com/components/mac-genie): a macOS dock with magnification. Click an icon and its window opens and minimizes with the genie warp.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <div className="mx-auto h-[600px] max-w-4xl">
      <GenieEffect />
    </div>
  ),
};
