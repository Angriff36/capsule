import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { MotionNumberInput } from "../components/motion-number-input";
import { MotionNumberSlider } from "../components/motion-number-slider";
import { NumberFlowTrading } from "../components/motion-number-trading";
import { MotionNumberUpvotes } from "../components/motion-number-upvotes";

const meta: Meta = {
  title: "UI Layouts Library/Forms/Motion Number",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Motion Number (https://ui-layouts.com/components/motion-number): numbers that roll between values, built on NumberFlow. Variants: input stepper, slider, upvotes and trading.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Input: Story = { render: () => <MotionNumberInput /> };
export const Slider: Story = { render: () => <MotionNumberSlider /> };
export const Upvotes: Story = { render: () => <MotionNumberUpvotes /> };
export const Trading: Story = { render: () => <NumberFlowTrading /> };
