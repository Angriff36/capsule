import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
} from "./Accordion";
import { Dialog } from "./Dialog";
import { FileDrop } from "./FileDrop";
import { MultiSelect } from "./MultiSelect";
import { SegmentedTabs } from "./SegmentedTabs";

const meta: Meta = {
  title: "Controls/UI Layouts",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Components adapted from ui-layouts.com (MIT, see src/ui/ui-layouts.LICENSE.txt) and drawn with Capsule tokens. SegmentedTabs replaces hand-made filter pills; Dialog replaces hand-made scrim + sheet pairs; Accordion replaces bare <details>; FileDrop replaces the browser's Choose file control; MultiSelect replaces <select multiple>. See docs/design/component-catalog.md.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const STATUS = [
  { value: "upcoming", label: "Upcoming", count: 12 },
  { value: "draft", label: "Drafts", count: 3 },
  { value: "past", label: "Past", count: 148 },
  { value: "all", label: "All" },
] as const;

function TabsDemo({ size }: { size?: "sm" | "md" }) {
  const [tab, setTab] = useState<(typeof STATUS)[number]["value"]>("upcoming");
  return (
    <div className="grid gap-3">
      <SegmentedTabs
        label="Show"
        options={STATUS}
        value={tab}
        onChange={setTab}
        size={size}
      />
      <p className="text-sm text-ink-2">Showing: {tab}</p>
    </div>
  );
}

export const Tabs: Story = { render: () => <TabsDemo /> };
export const TabsSmall: Story = { render: () => <TabsDemo size="sm" /> };

function DialogDemo({ size }: { size?: "sm" | "md" | "lg" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen(true)}
      >
        Add a guest
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size={size}
        title="Add a guest"
        description="The guest joins the count for this event."
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setOpen(false)}
            >
              Add guest
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <label className="field-label">
            Name
            <input className="input" placeholder="Jordan Lee" />
          </label>
          <label className="field-label">
            Dietary note
            <input className="input" placeholder="No shellfish" />
          </label>
        </div>
      </Dialog>
    </>
  );
}

export const DialogDefault: Story = {
  name: "Dialog",
  render: () => <DialogDemo />,
};
export const DialogLarge: Story = { render: () => <DialogDemo size="lg" /> };

export const AccordionSingle: Story = {
  name: "Accordion",
  render: () => (
    <div className="max-w-xl">
      <Accordion defaultValue={["kitchen"]}>
        <AccordionItem value="kitchen">
          <AccordionHeader meta="4 tasks">Kitchen notes</AccordionHeader>
          <AccordionPanel>
            <p className="text-sm text-ink-2">
              Fire the short rib at 4:30. Sauce holds in the warmer.
            </p>
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="setup">
          <AccordionHeader meta="2 tasks">Setup notes</AccordionHeader>
          <AccordionPanel>
            <p className="text-sm text-ink-2">
              Ten rounds of eight, buffet on the north wall.
            </p>
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="bar">
          <AccordionHeader>Bar</AccordionHeader>
          <AccordionPanel>
            <p className="text-sm text-ink-2">
              Beer and wine only. Client brings the champagne.
            </p>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  ),
};

export const AccordionMultiple: Story = {
  render: () => (
    <div className="max-w-xl">
      <Accordion multiple defaultValue={["a", "b"]}>
        <AccordionItem value="a">
          <AccordionHeader>Appetizers</AccordionHeader>
          <AccordionPanel>
            <p className="text-sm text-ink-2">Crab cakes, caprese skewers.</p>
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="b">
          <AccordionHeader>Entrées</AccordionHeader>
          <AccordionPanel>
            <p className="text-sm text-ink-2">
              Short rib, roast chicken, mushroom risotto.
            </p>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </div>
  ),
};

function FileDropDemo({ layout }: { layout?: "zone" | "row" }) {
  const [last, setLast] = useState("No file yet");
  return (
    <div className="grid max-w-md gap-2">
      <FileDrop
        layout={layout}
        accept=".csv,.xlsx"
        label="Drop the price list here"
        hint="CSV or Excel"
        onChange={(event) =>
          setLast(event.target.files?.[0]?.name ?? "No file yet")
        }
      />
      <p className="text-sm text-ink-2">Received: {last}</p>
    </div>
  );
}

export const FileDropZone: Story = {
  name: "FileDrop",
  render: () => <FileDropDemo />,
};
export const FileDropRow: Story = {
  render: () => <FileDropDemo layout="row" />,
};
export const FileDropDisabled: Story = {
  render: () => (
    <FileDrop disabled label="Upload paused" hint="A save is running" />
  ),
};

const STATIONS = [
  { value: "grill", label: "Grill" },
  { value: "saute", label: "Sauté" },
  { value: "pastry", label: "Pastry" },
  { value: "garde", label: "Garde manger" },
  { value: "bar", label: "Bar" },
];

function MultiDemo({ initial = [] as string[] }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <div className="grid max-w-sm gap-2 pb-72">
      <label className="field-label">
        Stations
        <MultiSelect
          options={STATIONS}
          value={value}
          onChange={setValue}
          placeholder="All stations"
        />
      </label>
      <p className="text-sm text-ink-2">Chosen: {value.join(", ") || "none"}</p>
    </div>
  );
}

export const MultiSelectEmpty: Story = {
  name: "MultiSelect",
  render: () => <MultiDemo />,
};
export const MultiSelectMany: Story = {
  render: () => (
    <MultiDemo initial={["grill", "saute", "pastry", "garde", "bar"]} />
  ),
};
