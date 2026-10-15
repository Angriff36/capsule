import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import ImageMouseTrail from "../components/image-mousetrail";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Image Mousetrail",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Image Mousetrail (https://ui-layouts.com/components/image-mousetrail): images pop in and follow the cursor as it moves across the box. Move the mouse over the box.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const images = [
  "https://images.unsplash.com/photo-1709949908058-a08659bfa922?q=80&w=1200&auto=format",
  "https://images.unsplash.com/photo-1548192746-dd526f154ed9?q=80&w=1200&auto=format",
  "https://images.unsplash.com/photo-1693581176773-a5f2362209e6?q=80&w=1200&auto=format",
  "https://images.unsplash.com/photo-1706049379414-437ec3a54e93?q=80&w=1200&auto=format",
  "https://images.unsplash.com/photo-1709949908219-fd9046282019?q=80&w=1200&auto=format",
  "https://images.unsplash.com/photo-1726551195764-f98a8e8a57c3?q=80&w=1200&auto=format",
  "https://images.unsplash.com/photo-1584043204475-8cc101d6c77a?q=80&w=1200&auto=format",
  "https://images.unsplash.com/photo-1546942113-a6c43b63104a?q=80&w=1200&auto=format",
];

const label = (
  <h2 className="pointer-events-none relative z-50 select-none text-center text-3xl font-semibold text-neutral-900">
    ✨ Experience Interactive Designs with Dynamic Mouse Trails
  </h2>
);

export const Default: Story = {
  render: () => (
    <ImageMouseTrail items={images} maxNumberOfImages={5} distance={25}>
      {label}
    </ImageMouseTrail>
  ),
};

export const SmallImages: Story = {
  render: () => (
    <ImageMouseTrail
      items={images}
      imgClass="w-20 h-24"
      maxNumberOfImages={8}
      distance={40}
    >
      <h2 className="pointer-events-none relative z-50 select-none text-center text-3xl font-semibold text-neutral-900">
        ✨ Experience
      </h2>
    </ImageMouseTrail>
  ),
};

export const DisappearImages: Story = {
  render: () => (
    <ImageMouseTrail items={images} fadeAnimation distance={25}>
      {label}
    </ImageMouseTrail>
  ),
};
