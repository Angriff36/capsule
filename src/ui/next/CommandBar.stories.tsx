import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CommandBar, type CommandItem } from "./CommandBar";
import { Kbd } from "./core";

const meta: Meta<typeof CommandBar> = {
  title: "Next/CommandBar",
  component: CommandBar,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: [
          "**New.** Capsule has a search box in the top bar; this replaces it with a jump-to-and-do surface.",
          "",
          "- `Ctrl/Cmd-K` anywhere, `Esc` to close, arrows to move, `Enter` to run",
          "- type `>` for commands only, `#` for events, `@` for people — the scope chip shows in the input",
          "- matching is fuzzy: `hag` finds *Harrington Annual Gala*",
          "- commands are verb + noun and carry their own shortcut",
        ].join("\n"),
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof CommandBar>;

const ITEMS: CommandItem[] = [
  {
    id: "e1",
    kind: "record",
    group: "Events",
    label: "Harrington Annual Gala",
    meta: "Aug 16 · 280 covers",
    glyph: "▤",
  },
  {
    id: "e2",
    kind: "record",
    group: "Events",
    label: "Colefax Wedding",
    meta: "Sep 02 · 140 covers",
    glyph: "▤",
  },
  {
    id: "e3",
    kind: "record",
    group: "Events",
    label: "Peregula Tasting",
    meta: "Today 11:00 AM · 10 covers",
    glyph: "▤",
  },
  {
    id: "e4",
    kind: "record",
    group: "Events",
    label: "TEST-0728 Garden Party",
    meta: "Sep 10 · 40 covers",
    glyph: "▤",
  },
  {
    id: "c1",
    kind: "command",
    group: "Actions",
    label: "Create event",
    shortcut: "C",
    glyph: "＋",
  },
  {
    id: "c2",
    kind: "command",
    group: "Actions",
    label: "Assign coordinator",
    shortcut: "A",
    glyph: "◍",
  },
  {
    id: "c3",
    kind: "command",
    group: "Actions",
    label: "Confirm sales lock",
    glyph: "⛓",
    keywords: "stage lock approve",
  },
  {
    id: "c4",
    kind: "command",
    group: "Actions",
    label: "Export BEO",
    shortcut: "E",
    glyph: "⇩",
  },
  {
    id: "c5",
    kind: "command",
    group: "Actions",
    label: "Log an incident",
    glyph: "⚠",
    keywords: "problem issue",
  },
  {
    id: "g1",
    kind: "command",
    group: "Go to",
    label: "Kitchen command deck",
    shortcut: "G K",
    glyph: "→",
  },
  {
    id: "g2",
    kind: "command",
    group: "Go to",
    label: "Purchasing queue",
    shortcut: "G P",
    glyph: "→",
  },
  {
    id: "g3",
    kind: "command",
    group: "Go to",
    label: "Staffing board",
    shortcut: "G S",
    glyph: "→",
  },
  {
    id: "p1",
    kind: "person",
    group: "People",
    label: "Sara Mitchell",
    meta: "Event manager · 6 events",
  },
  {
    id: "p2",
    kind: "person",
    group: "People",
    label: "James Harrington",
    meta: "Client contact",
  },
  {
    id: "p3",
    kind: "person",
    group: "People",
    label: "Dee Okafor",
    meta: "Sous chef · on shift",
  },
];

function Demo({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [ran, setRan] = useState<string>();
  const items = ITEMS.map((i) => ({ ...i, run: () => setRan(i.label) }));
  return (
    <div
      className="bg-canvas"
      style={{
        position: "relative",
        minHeight: 460,
        padding: 28,
        overflow: "hidden",
      }}
    >
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(true)}
        style={{ display: "inline-flex", gap: 8 }}
      >
        Search <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>
      </button>
      <p style={{ marginTop: 14, color: "var(--color-ink-2)", fontSize: 15 }}>
        {ran ? (
          <>
            Ran: <b>{ran}</b>
          </>
        ) : (
          "Nothing run yet."
        )}
      </p>
      <CommandBar items={items} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export const Open: Story = { render: () => <Demo /> };

export const Closed: Story = {
  name: "Closed (click to open)",
  render: () => <Demo initiallyOpen={false} />,
};
