import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CommandBar, useCommandBar, type CommandItem } from "./CommandBar";
import { LedgerTable } from "./LedgerTable";
import { ViewBar, type AppliedFilter } from "./ViewBar";
import { ServiceTimeline, StageRail } from "./schedule";
import {
  DecisionPrompt,
  InlineEdit,
  Kbd,
  Money,
  Num,
  Presence,
  ToastStack,
  useToasts,
} from "./core";

/* ============================================================================
   A page that does not exist yet, built only from the new components.

   This is the argument for the layer: today's Capsule cannot express this
   screen. Saved views, a working table with selection and inline edit, a day
   timeline, bulk actions, in-place decisions with consequences, and undo — one
   surface where a dispatcher runs the morning.
   ========================================================================== */

const meta: Meta = {
  title: "Next/Dispatch desk",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A screen assembled only from the Next layer. Press Ctrl-K. Select rows for the bulk bar. Click a quantity to edit it. Every control here is new — none of it can be built from the current component set.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

interface Job {
  id: string;
  event: string;
  window: string;
  covers: number;
  packed: number;
  driver: string;
  value: number;
  stage: string;
}

const JOBS: Job[] = [
  {
    id: "1",
    event: "Harrington Annual Gala",
    window: "15:30 → 17:00",
    covers: 280,
    packed: 264,
    driver: "T. Reddy",
    value: 38500,
    stage: "Sales lock",
  },
  {
    id: "2",
    event: "Peregula Tasting",
    window: "10:15 → 11:00",
    covers: 10,
    packed: 10,
    driver: "A. Vela",
    value: 0,
    stage: "Approved",
  },
  {
    id: "3",
    event: "Bellweather Conference",
    window: "06:00 → 08:30",
    covers: 450,
    packed: 450,
    driver: "T. Reddy",
    value: 128000,
    stage: "Executing",
  },
  {
    id: "4",
    event: "Ashcroft Retirement",
    window: "16:00 → 17:15",
    covers: 60,
    packed: 0,
    driver: "—",
    value: 8200,
    stage: "Approved",
  },
  {
    id: "5",
    event: "Colefax Wedding",
    window: "13:00 → 15:00",
    covers: 140,
    packed: 96,
    driver: "D. Okafor",
    value: 22400,
    stage: "Planning",
  },
];

const COMMANDS: CommandItem[] = [
  {
    id: "c1",
    kind: "command",
    group: "Dispatch",
    label: "Assign driver",
    shortcut: "D",
    glyph: "⇢",
  },
  {
    id: "c2",
    kind: "command",
    group: "Dispatch",
    label: "Mark packed",
    shortcut: "P",
    glyph: "▣",
  },
  {
    id: "c3",
    kind: "command",
    group: "Dispatch",
    label: "Print pack lists",
    glyph: "⎙",
  },
  {
    id: "c4",
    kind: "command",
    group: "Go to",
    label: "Kitchen command deck",
    shortcut: "G K",
    glyph: "→",
  },
  ...JOBS.map((j) => ({
    id: `r-${j.id}`,
    kind: "record" as const,
    group: "Today’s jobs",
    label: j.event,
    meta: `${j.window} · ${j.covers} covers`,
    glyph: "▤",
  })),
];

export const DispatchDesk: Story = {
  name: "Dispatch desk",
  render: () => {
    const { open, setOpen } = useCommandBar();
    const { toasts, push, dismiss } = useToasts();
    const [jobs, setJobs] = useState(JOBS);
    const [picked, setPicked] = useState<string[]>([]);
    const [view, setView] = useState("today");
    const [filters, setFilters] = useState<AppliedFilter[]>([
      { id: "f1", field: "Depot", value: "North" },
    ]);

    return (
      <div
        className="bg-canvas"
        style={{ position: "relative", minHeight: 760, padding: 24 }}
      >
        <div
          className="cx"
          style={{
            background: "var(--color-panel)",
            border: "1px solid var(--color-brand)",
            borderRadius: 22,
            padding: "28px 32px",
            display: "grid",
            gap: 20,
          }}
        >
          <header style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
            <div>
              <div className="eyebrow">Friday, August 28</div>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 40,
                  lineHeight: 0.95,
                  margin: "4px 0 0",
                }}
              >
                Dispatch desk
              </h1>
            </div>
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Presence
                people={[
                  { name: "Sara Mitchell" },
                  { name: "Dee Okafor" },
                  { name: "Tom Reddy" },
                ]}
              />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setOpen(true)}
              >
                Search <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>
              </button>
            </div>
          </header>

          <StageRail
            stages={[
              { id: "pick", label: "Picked", note: "5 of 5" },
              { id: "pack", label: "Packed", note: "3 of 5", blocked: true },
              { id: "load", label: "Loaded" },
              { id: "road", label: "On the road" },
              { id: "done", label: "Delivered" },
            ]}
            current="pack"
          />

          <ViewBar
            views={[
              { id: "today", label: "Today", count: 5 },
              { id: "unpacked", label: "Not packed", count: 2 },
              { id: "nodriver", label: "No driver", count: 1 },
              { id: "week", label: "This week", count: 19 },
            ]}
            activeView={view}
            onSelectView={setView}
            filters={filters}
            onRemoveFilter={(id) =>
              setFilters((f) => f.filter((x) => x.id !== id))
            }
            onClearFilters={() => setFilters([])}
            availableFilters={[
              { id: "f2", field: "Driver", value: "unassigned" },
              { id: "f3", field: "Covers", value: "over 100" },
            ]}
            onAddFilter={(f) => setFilters((all) => [...all, f])}
          />

          <LedgerTable<Job>
            rows={jobs}
            rowKey={(r) => r.id}
            selectable
            selected={picked}
            onSelectedChange={setPicked}
            showTotals
            columns={[
              { key: "event", header: "Event", sortable: true },
              { key: "window", header: "Load window", width: 150 },
              { key: "driver", header: "Driver", width: 110, sortable: true },
              {
                key: "covers",
                header: "Covers",
                numeric: true,
                total: true,
                width: 100,
                sortable: true,
                value: (r) => r.covers,
                render: (r) => <Num value={r.covers} />,
              },
              {
                key: "packed",
                header: "Packed",
                numeric: true,
                width: 120,
                value: (r) => r.packed,
                render: (r) => (
                  <span
                    style={{
                      color:
                        r.packed < r.covers ? "var(--color-danger)" : undefined,
                    }}
                  >
                    <InlineEdit
                      value={r.packed}
                      numeric
                      label={`Packed count for ${r.event}`}
                      format={(v) => <Num value={Number(v)} />}
                      validate={(v) =>
                        Number(v) > r.covers
                          ? `More than ${r.covers} covers`
                          : undefined
                      }
                      onCommit={(v) =>
                        setJobs((all) =>
                          all.map((j) =>
                            j.id === r.id ? { ...j, packed: Number(v) } : j,
                          ),
                        )
                      }
                    />
                  </span>
                ),
              },
              {
                key: "value",
                header: "Value",
                numeric: true,
                total: true,
                width: 120,
                value: (r) => r.value,
                render: (r) => <Money value={r.value} />,
              },
            ]}
            bulkActions={(ids) => (
              <>
                <button
                  onClick={() =>
                    push({
                      message: `Driver assigned to ${ids.length} jobs`,
                      undo: () => undefined,
                    })
                  }
                >
                  Assign driver
                </button>
                <button
                  onClick={() =>
                    push({ message: `${ids.length} pack lists printed` })
                  }
                >
                  Print pack lists
                </button>
                <DecisionPrompt
                  title={`Dispatch ${ids.length} jobs?`}
                  body="Drivers are notified and the pack lists close."
                  consequence="One job is short 16 covers against its headcount."
                  confirmLabel="Dispatch"
                  onConfirm={() => {
                    push({
                      message: `${ids.length} jobs dispatched`,
                      undo: () => undefined,
                    });
                    setPicked([]);
                  }}
                  trigger={(p) => <button {...p}>Dispatch</button>}
                />
              </>
            )}
          />

          <ServiceTimeline
            now={13 * 60 + 20}
            from={6 * 60}
            to={23 * 60}
            lanes={["Van 1", "Van 2", "Kitchen", "Front of house"]}
            blocks={[
              {
                id: "a",
                lane: "Van 1",
                label: "Bellweather load-in",
                start: 6 * 60,
                end: 8 * 60 + 30,
                kind: "move",
              },
              {
                id: "b",
                lane: "Van 1",
                label: "Harrington load",
                start: 15 * 60 + 30,
                end: 17 * 60,
                kind: "move",
              },
              {
                id: "c",
                lane: "Van 2",
                label: "Peregula",
                start: 10 * 60 + 15,
                end: 11 * 60,
                kind: "move",
              },
              {
                id: "d",
                lane: "Van 2",
                label: "Colefax + Ashcroft — same van",
                start: 13 * 60,
                end: 17 * 60 + 15,
                kind: "risk",
                detail: "Two load windows overlap",
              },
              {
                id: "e",
                lane: "Kitchen",
                label: "Hot line prep",
                start: 9 * 60,
                end: 15 * 60,
                kind: "prep",
              },
              {
                id: "f",
                lane: "Kitchen",
                label: "Service — mains",
                start: 19 * 60,
                end: 21 * 60,
                kind: "service",
              },
              {
                id: "g",
                lane: "Front of house",
                label: "Staff call — 22",
                start: 16 * 60,
                end: 17 * 60,
                kind: "prep",
              },
              {
                id: "h",
                lane: "Front of house",
                label: "Dinner service",
                start: 19 * 60,
                end: 22 * 60,
                kind: "service",
              },
            ]}
          />
        </div>

        <CommandBar
          items={COMMANDS.map((c) => ({
            ...c,
            run: () => push({ message: `Ran: ${c.label}` }),
          }))}
          open={open}
          onClose={() => setOpen(false)}
        />
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </div>
    );
  },
};
