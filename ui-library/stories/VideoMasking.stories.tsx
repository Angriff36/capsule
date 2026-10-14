import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import CreativeDemo from "../components/video-masking-creative";
import SplashWaterDemo from "../components/video-masking-splash-water";
import TextOverlayDemo from "../components/video-masking-text-overlay";
import HexagonDemo from "../components/video-masking-hexagon";
import HexagonTwoDemo from "../components/video-masking-hexagon2";

const meta: Meta = {
  title: "UI Layouts Library/Media & Galleries/Video Masking",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Video Masking (https://ui-layouts.com/components/video-masking): Scroll-driven video masking effects.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Creative: Story = { render: () => <CreativeDemo /> };
export const SplashWater: Story = { render: () => <SplashWaterDemo /> };
export const TextOverlay: Story = { render: () => <TextOverlayDemo /> };
export const Hexagon: Story = { render: () => <HexagonDemo /> };
export const HexagonTwo: Story = { render: () => <HexagonTwoDemo /> };
