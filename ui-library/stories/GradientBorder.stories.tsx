import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import DefaultDemo from "../components/gradient-border";

const meta: Meta = {
  title: "UI Layouts Library/Cards & Highlights/Gradient Border",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Gradient Border (https://ui-layouts.com/components/gradient-border): A card with a rotating conic-gradient border.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <DefaultDemo /> };
