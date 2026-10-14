import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import MotionDrawer from "../components/motion-drawer";

const meta: Meta = {
  title: "UI Layouts Library/Overlays/Motion Drawer",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Motion Drawer (https://ui-layouts.com/components/motion-drawer): a side menu that springs in, can be dragged closed, and whose open button merges, pushes or stays. The toggle button is fixed to the top corner of the page.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

function Links() {
  return (
    <nav className="space-y-4">
      <h2 className="text-xl font-bold mb-4">Menu</h2>
      <a href="#" className="block p-2 hover:bg-muted rounded-sm">
        Home
      </a>
      <a href="#" className="block p-2 hover:bg-muted rounded-sm">
        About
      </a>
      <a href="#" className="block p-2 hover:bg-muted rounded-sm">
        Contact
      </a>
    </nav>
  );
}

export const Left: Story = {
  render: () => (
    <div>
      <MotionDrawer direction="left" width={300} className="text-foreground">
        <Links />
      </MotionDrawer>
      <h1 className="text-7xl text-center">Motion Drawer</h1>
    </div>
  ),
};

export const Right: Story = {
  render: () => (
    <div>
      <MotionDrawer
        direction="right"
        buttonOpeningVariants="stay"
        width={300}
        className="text-foreground"
      >
        <Links />
      </MotionDrawer>
      <h1 className="text-7xl text-center">Motion Drawer</h1>
    </div>
  ),
};
