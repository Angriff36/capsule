import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import AutoscrollSlider from "../components/carousel-autoscroll";
import DefaultSlider from "../components/carousel-default";
import AlignSlider from "../components/carousel-align";
import ClassNameSlider from "../components/carousel-classname";
import NumberSlider from "../components/carousel-number";
import ScaleSlider from "../components/carousel-scale";
import ThumbnailSlider from "../components/carousel-thumbnail";
import AutostartSlider from "../components/carousel-autostart";
import VerticalSlider from "../components/carousel-vertical";
import VerticalThumbnailSlider from "../components/carousel-vertical-thumbnail";
import VerticalThumbnailAutostartSlider from "../components/carousel-vertical-thumbnail-autostart";

const meta: Meta = {
  title: "UI Layouts Library/Media & Galleries/Carousel",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Carousel: an Embla carousel with buttons, dots, progress, snap counter, scale, thumbnails, autoplay and vertical variants. (https://ui-layouts.com/components/carousel)",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <DefaultSlider /> };
export const Align: Story = { render: () => <AlignSlider /> };
export const ClassName: Story = { render: () => <ClassNameSlider /> };
export const Number: Story = { render: () => <NumberSlider /> };
export const Scale: Story = { render: () => <ScaleSlider /> };
export const Thumbnail: Story = { render: () => <ThumbnailSlider /> };
export const Autostart: Story = { render: () => <AutostartSlider /> };
export const Autoscroll: Story = { render: () => <AutoscrollSlider /> };
export const Vertical: Story = { render: () => <VerticalSlider /> };
export const VerticalThumbnail: Story = {
  render: () => <VerticalThumbnailSlider />,
};
export const VerticalThumbnailAutostart: Story = {
  render: () => <VerticalThumbnailAutostartSlider />,
};
