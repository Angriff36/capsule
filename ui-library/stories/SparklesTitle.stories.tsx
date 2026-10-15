import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import SparklesTitle from "../components/sparkles-title";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Sparkles Title",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Sparkles Title (https://ui-layouts.com/components/sparkles-title): a hero title under a glowing horizon of sparkles.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <div className="h-[560px] overflow-auto rounded-md">
      <SparklesTitle />
    </div>
  ),
};
