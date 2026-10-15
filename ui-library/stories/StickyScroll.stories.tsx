import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { LenisScrollFrame } from "../components/lenis-scroll-frame";
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
          "ui-layouts Sticky Scroll (https://ui-layouts.com/components/sticky-scroll): three layouts built on CSS position: sticky. Wrapped in Lenis smooth scrolling like the originals.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const StickyElementStory: Story = {
  name: "Sticky element",
  render: () => (
    <LenisScrollFrame height={560}>
      {() => <StickyElement bounded />}
    </LenisScrollFrame>
  ),
};

export const StickyGalleryStory: Story = {
  name: "Sticky gallery",
  render: () => (
    <LenisScrollFrame height={560}>
      {() => <StickyGallery bounded />}
    </LenisScrollFrame>
  ),
};

export const StickyHeroSectionStory: Story = {
  name: "Sticky hero section",
  render: () => (
    <LenisScrollFrame height={560}>
      {(container) => <StickyHeroSection container={container} />}
    </LenisScrollFrame>
  ),
};
