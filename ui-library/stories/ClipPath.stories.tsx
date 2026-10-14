import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import CreativeDemo from "../components/clip-path-creative";
import CorporateDemo from "../components/clip-path-corporate";
import SymbolicDemo from "../components/clip-path-symbolic";
import CreativeMaskDemo from "../components/clip-path-creative-mask";
import WaterSplashDemo from "../components/clip-path-water-splash";

const meta: Meta = {
  title: "UI Layouts Library/Media & Galleries/Clip Path",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Clip Path (https://ui-layouts.com/components/clip-path): Images revealed through SVG clip paths.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Creative: Story = { render: () => <CreativeDemo /> };
export const Corporate: Story = { render: () => <CorporateDemo /> };
export const Symbolic: Story = { render: () => <SymbolicDemo /> };
export const CreativeMask: Story = { render: () => <CreativeMaskDemo /> };
export const WaterSplash: Story = { render: () => <WaterSplashDemo /> };
