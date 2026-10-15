import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { InfinityBandScroll } from "../components/infinity-brand";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Infinity Brand",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Infinity Brand (https://ui-layouts.com/components/infinity-brand): a CSS-only strip of brand icons that scrolls forever, faded at both ends.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <InfinityBandScroll /> };
