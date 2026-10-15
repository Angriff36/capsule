import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import PhoneNumber from "../components/phone-input-demo";

const meta: Meta = {
  title: "UI Layouts Library/Forms/Phone Input",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Phone Input (https://ui-layouts.com/components/phone-input): an international phone field with a searchable country picker, validated on submit.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <PhoneNumber /> };
