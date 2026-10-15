import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { MultiSelectorDemo } from "../components/multi-selector-demo";

const meta: Meta = {
  title: "UI Layouts Library/Forms/Multi Selector",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Multi Selector (https://ui-layouts.com/components/multi-selector): a searchable multi-select with removable badges, select-all and an overflow count.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <MultiSelectorDemo /> };
