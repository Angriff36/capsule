import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import GithubButtonDemo from "../components/liquid-gradient-button";
import BackgroundDemo from "../components/liquid-gradient-demo";

const meta: Meta = {
  title: "UI Layouts Library/Visual Effects/Liquid Gradient",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Liquid Gradient (https://ui-layouts.com/components/liquid-gradient): Animated liquid gradient background built from moving radial gradients.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const GithubButton: Story = { render: () => <GithubButtonDemo /> };
export const Background: Story = { render: () => <BackgroundDemo /> };
