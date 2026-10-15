import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { LenisScrollFrame } from "../components/lenis-scroll-frame";
import StackingCard from "../components/stacking-card";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Stacking Card",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Stacking Card (https://ui-layouts.com/components/stacking-card): cards stick to the top and stack up, shrinking slightly as you scroll. Wrapped in Lenis smooth scrolling like the original.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <LenisScrollFrame height={560}>
      {(container) => <StackingCard container={container} />}
    </LenisScrollFrame>
  ),
};
