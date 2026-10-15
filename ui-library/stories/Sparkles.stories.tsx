import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { Sparkles } from "../components/sparkles";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Sparkles",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Sparkles (https://ui-layouts.com/components/sparkles): drifting, twinkling particles from tsParticles. Click to add more.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <div className="relative h-80 overflow-hidden rounded-md bg-black">
      <Sparkles
        density={400}
        size={1.4}
        direction="top"
        className="absolute inset-0 h-full w-full"
      />
    </div>
  ),
};

export const Colored: Story = {
  render: () => (
    <div className="relative h-80 overflow-hidden rounded-md bg-slate-950">
      <Sparkles
        density={250}
        size={2}
        speed={1}
        color="#fbbf24"
        hover
        className="absolute inset-0 h-full w-full"
      />
    </div>
  ),
};
