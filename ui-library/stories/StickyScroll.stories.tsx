import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { ScrollFrame } from "../components/motion-scroll-frame";
import {
  StickyElement,
  StickyGallery,
  StickyHeroSection,
} from "../components/sticky-scroll";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Sticky Scroll",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Sticky Scroll (https://ui-layouts.com/components/sticky-scroll): three layouts built on CSS position: sticky. The originals wrap the page in Lenis smooth scrolling; that wrapper is not included.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const StickyElementStory: Story = {
  name: "Sticky element",
  render: () => (
    <ScrollFrame height={560}>{() => <StickyElement />}</ScrollFrame>
  ),
};

export const StickyGalleryStory: Story = {
  name: "Sticky gallery",
  render: () => (
    <ScrollFrame height={560}>{() => <StickyGallery />}</ScrollFrame>
  ),
};

export const StickyHeroSectionStory: Story = {
  name: "Sticky hero section",
  render: () => (
    <ScrollFrame height={560}>
      {(container) => <StickyHeroSection container={container} />}
    </ScrollFrame>
  ),
};
