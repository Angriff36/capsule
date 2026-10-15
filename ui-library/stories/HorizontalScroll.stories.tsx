import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import HorizontalScroll from "../components/horizontal-scroll";
import { LenisScrollFrame } from "../components/lenis-scroll-frame";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Horizontal Scroll",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Horizontal Scroll (https://ui-layouts.com/components/horizontal-scroll): scrolling down slides a row of full-screen panels sideways while each heading drifts across. Wrapped in Lenis smooth scrolling like the original.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <LenisScrollFrame height={560}>
      {(container) => <HorizontalScroll container={container} />}
    </LenisScrollFrame>
  ),
};
