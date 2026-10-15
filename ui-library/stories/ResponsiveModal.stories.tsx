import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { libraryFrame } from "../LibraryFrame";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalTrigger,
} from "../components/responsive-modal";

const meta: Meta = {
  title: "UI Layouts Library/Overlays/Responsive Modal",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Responsive Modal (https://ui-layouts.com/components/responsive-modal): a centered dialog on desktop that becomes a swipe-down drawer on narrow screens (under 768px). Built with Vaul and Motion.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const triggerClass =
  "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground";

function ModalBody() {
  return (
    <ResponsiveModalContent className="p-6">
      <h2 className="text-lg font-semibold">Confirm the tasting</h2>
      <p className="mt-2 text-sm text-neutral-500">
        Saturday 4 pm, six guests. Short rib, roast chicken and the mushroom
        risotto are on the menu.
      </p>
    </ResponsiveModalContent>
  );
}

export const WithTrigger: Story = {
  name: "Trigger content",
  render: () => (
    <div className="flex justify-center">
      <ResponsiveModal>
        <ResponsiveModalTrigger asChild>
          <button type="button" className={triggerClass}>
            Open modal
          </button>
        </ResponsiveModalTrigger>
        <ModalBody />
      </ResponsiveModal>
    </div>
  ),
};

function Controlled() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-center">
      <button
        type="button"
        className={triggerClass}
        onClick={() => setOpen(true)}
      >
        Open modal
      </button>
      <ResponsiveModal open={open} setOpen={setOpen}>
        <ModalBody />
      </ResponsiveModal>
    </div>
  );
}

export const WithState: Story = {
  name: "Controlled with state",
  render: () => <Controlled />,
};
