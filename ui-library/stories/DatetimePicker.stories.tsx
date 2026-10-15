import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import {
  DatetimePickerDateOnly,
  DatetimePickerDefault,
  DatetimePickerTimeOnly,
} from "../components/datetime-picker-demos";

const meta: Meta = {
  title: "UI Layouts Library/Forms/Datetime Picker",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Datetime Picker (https://ui-layouts.com/components/datetime-picker): a natural-language date and time field with an optional calendar and time list. Variants: default, time only, date only.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <DatetimePickerDefault /> };
export const TimeOnly: Story = { render: () => <DatetimePickerTimeOnly /> };
export const DateOnly: Story = { render: () => <DatetimePickerDateOnly /> };
