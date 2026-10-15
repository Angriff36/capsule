import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import DefaultDemo from "../components/buy-me-coffee";

const meta: Meta = {
  title: "UI Layouts Library/Cards & Highlights/Buy Me A Coffee",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Buy Me A Coffee (https://ui-layouts.com/components/buy-me-coffee): An animated Buy Me A Coffee link card.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <DefaultDemo /> };
