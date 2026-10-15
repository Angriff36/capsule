import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import Faqs from "../components/faqs";

const meta: Meta = {
  title: "UI Layouts Library/Disclosure/FAQs",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Animated FAQs (https://ui-layouts.com/components/faqs): question list where a plus icon turns into a cross and the answer slides open.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <Faqs /> };
