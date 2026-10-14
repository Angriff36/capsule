import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import DefaultDemo from "../components/animated-beam-default";
import BidirectionalDemo from "../components/animated-beam-bidirectional";
import UnidirectionalDemo from "../components/animated-beam-unidirectional";
import MultipleInputDemo from "../components/animated-beam-multiple-input";
import MultipleOutputDemo from "../components/animated-beam-multiple-output";

const meta: Meta = {
  title: "UI Layouts Library/Visual Effects/Animated Beam",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Animated Beam (https://ui-layouts.com/components/animated-beam): Animated beams that connect elements, with single, two-way and many-to-one layouts.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <DefaultDemo /> };
export const Bidirectional: Story = { render: () => <BidirectionalDemo /> };
export const Unidirectional: Story = { render: () => <UnidirectionalDemo /> };
export const MultipleInput: Story = { render: () => <MultipleInputDemo /> };
export const MultipleOutput: Story = { render: () => <MultipleOutputDemo /> };
