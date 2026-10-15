import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import GlobeDefault from "../components/globe-default";
import GlobeLight from "../components/globe-white";
import GlobeSparkles from "../components/globe-sparkles";

const meta: Meta = {
  title: "UI Layouts Library/3D & Visuals/Globe",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Globe: a rotating cobe globe with adjustable colours (https://ui-layouts.com/components/globe)",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <GlobeDefault /> };
export const Light: Story = { render: () => <GlobeLight /> };
export const Sparkles: Story = { render: () => <GlobeSparkles /> };
