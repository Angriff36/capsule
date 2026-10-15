import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { LenisScrollFrame } from "../components/lenis-scroll-frame";
import SmoothScroll from "../components/smooth-scroll";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Smooth Scroll",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Smooth Scroll (https://ui-layouts.com/components/smooth-scroll): Lenis smooth scrolling over sticky full-screen sections. Here Lenis drives the framed scroll box instead of the whole page.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <LenisScrollFrame height={560}>
      {() => <SmoothScroll bounded />}
    </LenisScrollFrame>
  ),
};
