import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import NormalCarousel from "../components/framer-carousel-normal";
import DraggableCarousel from "../components/framer-carousel-draggable";
import AutoplayCarousel from "../components/framer-carousel-autoplay";
import MultiCarousel from "../components/framer-carousel-multi";
import ThumbnailsCarousel from "../components/framer-carousel-thumbnails";
import MoveableThumbnailsCarousel from "../components/framer-carousel-moveable-thumbnails";
import DragSlidingCarousel from "../components/framer-carousel-drag-sliding";

const meta: Meta = {
  title: "UI Layouts Library/Media & Galleries/Framer Carousel",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Framer Carousel: carousels built with motion (spring slide, drag, autoplay, multi-slide, thumbnails, drag-sliding) (https://ui-layouts.com/components/framer-carousel)",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Normal: Story = { render: () => <NormalCarousel /> };
export const Draggable: Story = { render: () => <DraggableCarousel /> };
export const Autoplay: Story = { render: () => <AutoplayCarousel /> };
export const Multi: Story = { render: () => <MultiCarousel /> };
export const Thumbnails: Story = { render: () => <ThumbnailsCarousel /> };
export const MoveableThumbnails: Story = {
  render: () => <MoveableThumbnailsCarousel />,
};
export const DragSliding: Story = { render: () => <DragSlidingCarousel /> };
