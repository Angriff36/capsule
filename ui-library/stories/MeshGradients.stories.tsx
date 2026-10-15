import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import ShaderGradientMesh from "../components/mesh-gradients-shader";
import BerriesGradient from "../components/mesh-gradients-berries";
import YellowGradient from "../components/mesh-gradients-yellow";
import LemonGradient from "../components/mesh-gradients-lemon";

const meta: Meta = {
  title: "UI Layouts Library/3D & Visuals/Mesh Gradients",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Mesh Gradients: animated shader blobs (react-three-fiber). (https://ui-layouts.com/components/mesh-gradients)",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Berries: Story = { render: () => <BerriesGradient /> };
export const Yellow: Story = { render: () => <YellowGradient /> };
export const Lemon: Story = { render: () => <LemonGradient /> };
export const ShaderGradient: Story = { render: () => <ShaderGradientMesh /> };
