import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import AccordionModal from "../components/gallery-modal";
import GalleryTabs from "../components/gallery-modal-tab";
import UnsplashGrid from "../components/gallery-modal-unsplash";

const meta: Meta = {
  title: "UI Layouts Library/Overlays/Gallery Modal",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Gallery Modal (https://ui-layouts.com/components/gallery-modal): images that open in an animated modal on click. Three demos: an accordion strip, an Unsplash-style masonry grid with next/previous, and a gallery with a draggable thumbnail rail.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const ImageAccordion: Story = { render: () => <AccordionModal /> };
export const UnsplashStyle: Story = { render: () => <UnsplashGrid /> };
export const GalleryTab: Story = { render: () => <GalleryTabs /> };
