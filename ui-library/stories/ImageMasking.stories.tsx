import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import CreativeDemo from "../components/image-masking-creative";
import AnimalDemo from "../components/image-masking-animal";
import WaterSplashDemo from "../components/image-masking-water-splash";
import CenterDemo from "../components/image-masking-center";
import FixedBackgroundDemo from "../components/image-masking-fixed-bg";

const meta: Meta = {
  title: "UI Layouts Library/Media & Galleries/Image Masking",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Image Masking (https://ui-layouts.com/components/image-masking): Scroll-driven image masking effects.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Creative: Story = { render: () => <CreativeDemo /> };
export const Animal: Story = { render: () => <AnimalDemo /> };
export const WaterSplash: Story = { render: () => <WaterSplashDemo /> };
export const Center: Story = { render: () => <CenterDemo /> };
export const FixedBackground: Story = { render: () => <FixedBackgroundDemo /> };
