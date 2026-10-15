import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import {
  DirectionalDrawer,
  DrawerContent,
  DrawerTrigger,
} from "../components/directional-drawer";

const meta: Meta = {
  title: "UI Layouts Library/Overlays/Directional Drawer",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Directional Drawer (https://ui-layouts.com/components/directional-drawer): a Vaul drawer that slides in from the left, right, top or bottom. Swipe to close on mobile; a close button shows on desktop.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

type Direction = "left" | "right" | "top" | "bottom";

function Demo({ direction, label }: { direction: Direction; label: string }) {
  return (
    <div className="flex justify-center">
      <DirectionalDrawer direction={direction}>
        <DrawerTrigger>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {label}
          </button>
        </DrawerTrigger>
        <DrawerContent className="p-6">
          <h2 className="text-lg font-semibold">Event menu</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>Short rib</li>
            <li>Roast chicken</li>
            <li>Mushroom risotto</li>
          </ul>
        </DrawerContent>
      </DirectionalDrawer>
    </div>
  );
}

export const LeftSidebar: Story = {
  name: "Left sidebar",
  render: () => <Demo direction="left" label="Open left drawer" />,
};

export const RightSidebar: Story = {
  name: "Right sidebar",
  render: () => <Demo direction="right" label="Open right drawer" />,
};

export const TopSidebar: Story = {
  name: "Top sidebar",
  render: () => <Demo direction="top" label="Open top drawer" />,
};

export const BottomSidebar: Story = {
  name: "Bottom sidebar",
  render: () => <Demo direction="bottom" label="Open bottom drawer" />,
};
