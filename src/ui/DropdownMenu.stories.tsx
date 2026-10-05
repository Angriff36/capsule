import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./DropdownMenu";
import { ChevronDownIcon } from "./icons";

const meta: Meta<typeof DropdownMenuContent> = {
  title: "Controls/DropdownMenu",
  component: DropdownMenuContent,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Reusable Origin UI / Radix dropdown with Capsule tokens. Import from src/ui/DropdownMenu.tsx. Compose Root → Trigger (asChild for a button) → Content → Items; use onSelect for actions and asChild for router links. Arrow keys, typeahead, Escape, focus return, outside dismissal, and viewport positioning are handled by Radix. Use a select/combobox for form values. See docs/design/component-catalog.md.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof DropdownMenuContent>;

function Trigger({ label = "More" }: { label?: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <button type="button" className="btn btn-ghost">
        {label}
        <ChevronDownIcon width={12} height={12} />
      </button>
    </DropdownMenuTrigger>
  );
}

function ActionsDemo({ open = false }: { open?: boolean }) {
  const [lastAction, setLastAction] = useState("No action selected");
  return (
    <div className="min-h-72">
      <DropdownMenu defaultOpen={open}>
        <Trigger />
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Event</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => setLastAction("Edit event selected")}
            >
              Edit event
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setLastAction("Copy event selected")}
            >
              Copy event
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              Send proposal (sending…)
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setLastAction("Archive event selected")}
          >
            Archive event
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <p role="status" className="mt-4 text-sm text-ink-2">
        {lastAction}
      </p>
    </div>
  );
}

export const Actions: Story = { render: () => <ActionsDemo /> };
export const OpenMenu: Story = { render: () => <ActionsDemo open /> };

function PreferencesDemo() {
  const [archived, setArchived] = useState(false);
  const [view, setView] = useState("upcoming");
  return (
    <div className="min-h-80">
      <DropdownMenu>
        <Trigger label="View options" />
        <DropdownMenuContent align="start">
          <DropdownMenuCheckboxItem
            checked={archived}
            onCheckedChange={setArchived}
            onSelect={(event) => event.preventDefault()}
          >
            Show archived
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Show events</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={view} onValueChange={setView}>
            <DropdownMenuRadioItem value="upcoming">
              Upcoming
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="attention">
              Needs action
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="all">
              All events
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <p role="status" className="mt-4 text-sm text-ink-2">
        View: {view}; archived: {archived ? "shown" : "hidden"}
      </p>
    </div>
  );
}
export const CheckboxAndRadioChoices: Story = {
  render: () => <PreferencesDemo />,
};

export const SameWidthAndLongLabels: Story = {
  render: () => (
    <div className="min-h-64 w-64 max-w-full">
      <DropdownMenu>
        <Trigger label="Event documents" />
        <DropdownMenuContent
          className="w-[var(--radix-dropdown-menu-trigger-width)]"
          align="start"
        >
          <DropdownMenuItem>
            Download the complete event workbook and service instructions
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            Download invoice (not created yet)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ),
};

export const NestedActions: Story = {
  render: () => (
    <div className="min-h-64">
      <DropdownMenu>
        <Trigger label="Documents" />
        <DropdownMenuContent align="start">
          <DropdownMenuItem>Event workbook</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Kitchen documents</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Prep list</DropdownMenuItem>
              <DropdownMenuItem>Recipe cards</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ),
};
