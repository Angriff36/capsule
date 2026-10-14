import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { ScrollFrame } from "../components/motion-scroll-frame";
import StackingCard from "../components/stacking-card";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Stacking Card",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Stacking Card (https://ui-layouts.com/components/stacking-card): cards stick to the top and stack up, shrinking slightly as you scroll. The original also wraps the page in Lenis smooth scrolling; that wrapper is not included.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <ScrollFrame height={560}>
      {(container) => <StackingCard container={container} />}
    </ScrollFrame>
  ),
};
