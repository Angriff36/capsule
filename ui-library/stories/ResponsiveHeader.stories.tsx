import type { Meta, StoryObj } from "@storybook/react-vite";
import { MenuIcon } from "lucide-react";
import { useState } from "react";
import { libraryFrame } from "../LibraryFrame";
import { DrawerContent, HeaderDrawer } from "../components/responsive-header";

const meta: Meta = {
  title: "UI Layouts Library/Layout/Responsive Header",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Responsive Header (https://ui-layouts.com/components/responsive-header): a header menu that drops down from the top as a Vaul drawer. Drag up to close on mobile.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const links = ["Events", "Menus", "Staff", "Invoices"];

function Links() {
  return (
    <DrawerContent>
      <nav className="mx-auto flex max-w-xl flex-col gap-3 px-6 py-4 text-sm">
        {links.map((link) => (
          <a key={link} href="#" className="font-medium">
            {link}
          </a>
        ))}
      </nav>
    </DrawerContent>
  );
}

export const Header: Story = {
  name: "Header",
  render: () => (
    <header className="flex items-center justify-between rounded-md border px-4 py-3">
      <span className="font-semibold">Capsule</span>
      <HeaderDrawer
        drawerBtn={() => (
          <button type="button" aria-label="Open menu">
            <MenuIcon />
          </button>
        )}
      >
        <Links />
      </HeaderDrawer>
    </header>
  ),
};

function WithState() {
  const [open, setOpen] = useState(false);
  return (
    <header className="flex items-center justify-between rounded-md border px-4 py-3">
      <span className="font-semibold">Capsule</span>
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </button>
      <HeaderDrawer open={open} setOpen={setOpen}>
        <Links />
      </HeaderDrawer>
    </header>
  );
}

export const ControlledWithState: Story = {
  name: "Controlled with state",
  render: () => <WithState />,
};
