import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import HorizontalScroll from "../components/horizontal-scroll";
import { ScrollFrame } from "../components/motion-scroll-frame";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Horizontal Scroll",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Horizontal Scroll (https://ui-layouts.com/components/horizontal-scroll): scrolling down slides a row of full-screen panels sideways while each heading drifts across. The original also wraps the page in Lenis smooth scrolling; that wrapper is not included.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <ScrollFrame height={560}>
      {(container) => <HorizontalScroll container={container} />}
    </ScrollFrame>
  ),
};
