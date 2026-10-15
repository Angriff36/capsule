import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import VideoDemo from "../components/blur-vignette-video";
import ImageDemo from "../components/blur-vignette-img";
import CardDemo from "../components/blur-vignette-card";

const meta: Meta = {
  title: "UI Layouts Library/Visual Effects/Blur Vignette",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Blur Vignette (https://ui-layouts.com/components/blur-vignette): Progressive edge blur over images, video and cards.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Video: Story = { render: () => <VideoDemo /> };
export const Image: Story = { render: () => <ImageDemo /> };
export const Card: Story = { render: () => <CardDemo /> };
