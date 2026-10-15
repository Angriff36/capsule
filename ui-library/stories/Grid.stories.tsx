import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import BoxDemo from "../components/grid-box";
import ConditionDemo from "../components/grid-condition";
import NormalDemo from "../components/grid-normal";

const meta: Meta = {
  title: "UI Layouts Library/Layout/Grid",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Grid (https://ui-layouts.com/components/grid): Grid layouts: box, conditional and normal.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Box: Story = { render: () => <BoxDemo /> };
export const Condition: Story = { render: () => <ConditionDemo /> };
export const Normal: Story = { render: () => <NormalDemo /> };
