import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import DefaultDemo from "../components/noise";

const meta: Meta = {
  title: "UI Layouts Library/Visual Effects/Noise",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Noise (https://ui-layouts.com/components/noise): A grainy noise overlay on a section, with a slider for the overlay opacity.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <DefaultDemo /> };
