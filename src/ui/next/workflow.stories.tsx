import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ViewBar, type AppliedFilter } from "./ViewBar";
import { SplitInspector } from "./SplitInspector";
import { ActivityTrail } from "./ActivityTrail";
import {
  DecisionPrompt,
  InlineEdit,
  Money,
  Presence,
  TimeWindowField,
  ToastStack,
  useToasts,
  type TimeValue,
} from "./core";
import { StageRail } from "./schedule";

const meta: Meta = { title: "Next/Workflow", parameters: { layout: "padded" } };
export default meta;
type Story = StoryObj;

/* --------------------------------------------------------------------- ViewBar */

export const Views: Story = {
  name: "ViewBar",
  parameters: {
    docs: {
      description: {
        story:
          "**New.** An operator asks the same three questions every morning and rebuilds the query by hand each time. Saved views as tabs, applied filters as removable chips, 2-3 promoted filters and the rest behind *Add filter*, and a dirty marker until you Save or Save as.",
      },
    },
  },
  render: () => {
    const [view, setView] = useState("today");
    const [filters, setFilters] = useState<AppliedFilter[]>([
      { id: "f1", field: "Stage", value: "Approval" },
      { id: "f2", field: "Owner", value: "Sara Mitchell" },
    ]);
    const [dirty, setDirty] = useState(true);
    const [q, setQ] = useState("");
    return (
      <ViewBar
        views={[
          { id: "today", label: "Today", count: 3 },
          { id: "unconfirmed", label: "Unconfirmed", count: 7 },
          { id: "late", label: "Late invoices", count: 5 },
          { id: "mine", label: "Mine", count: 12 },
          { id: "all", label: "All events", count: 94 },
        ]}
        activeView={view}
        onSelectView={(id) => {
          setView(id);
          setDirty(false);
        }}
        filters={filters}
        onRemoveFilter={(id) => {
          setFilters((f) => f.filter((x) => x.id !== id));
          setDirty(true);
        }}
        onClearFilters={() => {
          setFilters([]);
          setDirty(true);
        }}
        availableFilters={[
          { id: "f3", field: "Covers", value: "over 100" },
          { id: "f4", field: "Venue", value: "The Grand Pavilion" },
          { id: "f5", field: "Service", value: "Plated" },
        ]}
        onAddFilter={(f) => {
          setFilters((all) => [...all, f]);
          setDirty(true);
        }}
        dirty={dirty}
        onSave={() => setDirty(false)}
        onSaveAs={() => setDirty(false)}
        search={q}
        onSearch={(v) => {
          setQ(v);
          setDirty(true);
        }}
        right={
          <Presence
            people={[
              { name: "Sara Mitchell" },
              { name: "Dee Okafor" },
              { name: "Tom Reddy" },
              { name: "Ana Vela" },
            ]}
          />
        }
      />
    );
  },
};

/* -------------------------------------------------------------- SplitInspector */

const QUEUE = [
  {
    id: "q1",
    title: "Colefax Wedding",
    sub: "Sep 02 · 140 covers · quote $22,400",
    right: "2d",
  },
  {
    id: "q2",
    title: "Meridian Launch",
    sub: "Sep 18 · 220 covers · quote $61,900",
    right: "4d",
  },
  {
    id: "q3",
    title: "Ashcroft Retirement",
    sub: "Aug 30 · 60 covers · quote $8,200",
    right: "5d",
  },
  {
    id: "q4",
    title: "Bellweather Conference",
    sub: "Oct 04 · 450 covers · quote $128,000",
    right: "1w",
  },
  {
    id: "q5",
    title: "Peregula Tasting",
    sub: "Today · 10 covers · no charge",
    right: "1w",
  },
];

export const Triage: Story = {
  name: "SplitInspector",
  parameters: {
    docs: {
      description: {
        story:
          "**New.** Today you open an event, decide, go back, and rebuild your position in the list. Here the queue stays put: `j`/`k` to move, decide on the right. A morning of approvals takes four minutes instead of forty.",
      },
    },
  },
  render: () => {
    const [id, setId] = useState("q1");
    const { toasts, push, dismiss } = useToasts();
    const item = QUEUE.find((q) => q.id === id)!;
    return (
      <div style={{ position: "relative" }}>
        <SplitInspector
          items={QUEUE}
          selectedId={id}
          onSelect={setId}
          renderDetail={() => (
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 30,
                    lineHeight: 1,
                  }}
                >
                  {item.title}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    color: "var(--color-ink-3)",
                    fontSize: 14,
                  }}
                >
                  {item.sub}
                </div>
              </div>
              <StageRail
                stages={[
                  { id: "quote", label: "Quote" },
                  { id: "planning", label: "Planning" },
                  { id: "approval", label: "Approval", note: "waiting on you" },
                  { id: "approved", label: "Approved" },
                  { id: "lock", label: "Sales lock" },
                ]}
                current="approval"
              />
              <div style={{ display: "flex", gap: 10 }}>
                <DecisionPrompt
                  title="Approve this quote?"
                  body="The client is notified and the menu locks for costing."
                  consequence="Quote is 8% under your usual margin for this venue."
                  confirmLabel="Approve"
                  onConfirm={() =>
                    push({
                      message: `Approved ${item.title}`,
                      undo: () => undefined,
                    })
                  }
                  trigger={(p) => (
                    <button className="btn btn-primary btn-sm" {...p}>
                      Approve
                    </button>
                  )}
                />
                <DecisionPrompt
                  title="Send back to planning?"
                  body="The coordinator gets it back with your note."
                  confirmLabel="Send back"
                  tone="danger"
                  onConfirm={() =>
                    push({
                      message: `${item.title} returned to planning`,
                      tone: "danger",
                    })
                  }
                  trigger={(p) => (
                    <button className="btn btn-ghost btn-sm" {...p}>
                      Send back
                    </button>
                  )}
                />
              </div>
            </div>
          )}
        />
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </div>
    );
  },
};

/* -------------------------------------------------------------- ActivityTrail */

export const Trail: Story = {
  name: "ActivityTrail",
  parameters: {
    docs: {
      description: {
        story:
          "**New.** Capsule records mutations and shows them nowhere. When a plated count drops the day before service, somebody has to know who did it. Field changes render as an explicit before → after diff, not prose.",
      },
    },
  },
  render: () => (
    <div style={{ maxWidth: 620 }}>
      <ActivityTrail
        entries={[
          {
            id: "1",
            who: "Sara Mitchell",
            when: "2m ago",
            field: "Headcount",
            from: "280",
            to: "264",
            tone: "warn",
            note: "Client called — two tables dropped out.",
          },
          {
            id: "2",
            who: "Dee Okafor",
            when: "18m ago",
            field: "Plated — beef",
            from: "180",
            to: "168",
          },
          {
            id: "3",
            who: "Tom Reddy",
            when: "1h ago",
            action: "Submitted vendor order PO-2026-118",
            tone: "ok",
          },
          {
            id: "4",
            who: "Sara Mitchell",
            when: "3h ago",
            field: "Stage",
            from: "Approved",
            to: "Sales lock",
            tone: "ok",
          },
          {
            id: "5",
            who: "System",
            when: "Yesterday",
            action: "Sales lock deadline set to Aug 13",
          },
          {
            id: "6",
            who: "Ana Vela",
            when: "Yesterday",
            field: "Venue",
            from: "Willow Barn",
            to: "The Grand Pavilion",
            tone: "danger",
            note: "Barn double-booked. Rentals need re-quoting.",
          },
        ]}
      />
    </div>
  ),
};

/* ------------------------------------------------------------ Small components */

export const Decisions: Story = {
  name: "DecisionPrompt",
  parameters: {
    docs: {
      description: {
        story:
          "**Fixes a real bug.** Row-level confirmations currently render at the very top of the page, so the action reads as a silent no-op. This anchors to its own trigger and — the part that matters — states the consequence before you commit.",
      },
    },
  },
  render: () => {
    const { toasts, push, dismiss } = useToasts();
    return (
      <div
        style={{
          position: "relative",
          minHeight: 260,
          display: "flex",
          gap: 14,
        }}
      >
        <DecisionPrompt
          title="Confirm sales lock?"
          body="Menu, headcount and pricing freeze."
          consequence="3 prep tasks are still open and will be locked as-is."
          confirmLabel="Lock it"
          onConfirm={() =>
            push({ message: "Sales lock confirmed", undo: () => undefined })
          }
          trigger={(p) => (
            <button className="btn btn-primary btn-sm" {...p}>
              Confirm sales lock
            </button>
          )}
        />
        <DecisionPrompt
          title="Cancel this event?"
          body="Staff are unassigned and vendor orders are flagged."
          consequence="A submitted order for $6,400 cannot be recalled automatically."
          confirmLabel="Cancel event"
          tone="danger"
          onConfirm={() =>
            push({
              message: "Event cancelled",
              tone: "danger",
              undo: () => undefined,
            })
          }
          trigger={(p) => (
            <button className="btn btn-danger btn-sm" {...p}>
              Cancel event
            </button>
          )}
        />
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </div>
    );
  },
};

export const Windows: Story = {
  name: "TimeWindowField",
  parameters: {
    docs: {
      description: {
        story:
          "**Fixes a real bug.** The app's native datetime inputs swallow keystrokes in the year segment and don't stick when set programmatically. This owns its segments — arrow keys step, typing overwrites, `a`/`p` set the meridiem — and shows the derived duration, which is the number an operator is actually reasoning about.",
      },
    },
  },
  render: () => {
    const [a, setA] = useState({
      from: { h: 5, m: 0, pm: true },
      to: { h: 11, m: 0, pm: true },
    });
    const [b, setB] = useState({
      from: { h: 4, m: 30, pm: false },
      to: { h: 4, m: 45, pm: false },
    });
    const row = (
      label: string,
      v: { from: TimeValue; to: TimeValue },
      set: (x: typeof v) => void,
    ) => (
      <label style={{ display: "grid", gap: 6 }}>
        <span className="cx-cmd-group" style={{ padding: 0 }}>
          {label}
        </span>
        <TimeWindowField from={v.from} to={v.to} onChange={set} />
      </label>
    );
    return (
      <div style={{ display: "grid", gap: 20, maxWidth: 460 }}>
        {row("Service window", a, setA)}
        {row("Room flip (too short)", b, setB)}
      </div>
    );
  },
};

export const Edits: Story = {
  name: "InlineEdit",
  parameters: {
    docs: {
      description: {
        story:
          "`Enter`/`F2`/click starts, `Enter` commits, `Esc` reverts, `Tab` commits and moves on. A rejected value stays on screen with the reason instead of silently snapping back — the failure that makes people stop trusting inline edit.",
      },
    },
  },
  render: () => {
    const [covers, setCovers] = useState(280);
    const [price, setPrice] = useState(38500);
    const [note, setNote] = useState("Load-in via freight elevator");
    return (
      <div style={{ display: "grid", gap: 16, maxWidth: 460, fontSize: 15 }}>
        <div>
          <b style={{ marginRight: 10 }}>Headcount</b>
          <InlineEdit
            value={covers}
            numeric
            onCommit={(v) => setCovers(Number(v))}
            validate={(v) =>
              Number(v) > 500 ? "Over venue capacity (500)" : undefined
            }
          />
        </div>
        <div>
          <b style={{ marginRight: 10 }}>Quoted price</b>
          <InlineEdit
            value={price}
            numeric
            format={(v) => <Money value={Number(v)} />}
            onCommit={(v) => setPrice(Number(v))}
          />
        </div>
        <div>
          <b style={{ marginRight: 10 }}>Note</b>
          <InlineEdit value={note} onCommit={(v) => setNote(v)} />
        </div>
        <div>
          <b style={{ marginRight: 10 }}>Async, server rejects</b>
          <InlineEdit
            value="try changing me"
            onCommit={async () => {
              await new Promise((r) => setTimeout(r, 700));
              throw new Error("Locked by sales lock");
            }}
          />
        </div>
      </div>
    );
  },
};

export const Undo: Story = {
  name: "ToastStack + undo",
  parameters: {
    docs: {
      description: {
        story:
          "Undo for ten seconds is cheaper than a confirmation dialog on everything, and it is the right affordance for a fast operator who will occasionally misclick.",
      },
    },
  },
  render: () => {
    const { toasts, push, dismiss } = useToasts();
    const [count, setCount] = useState(12);
    return (
      <div style={{ position: "relative", minHeight: 220 }}>
        <p style={{ fontSize: 15 }}>
          Pack lists dispatched: <b>{count}</b>
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setCount((c) => c + 1);
              push({
                message: "Pack list dispatched",
                undo: () => setCount((c) => c - 1),
              });
            }}
          >
            Dispatch one
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() =>
              push({
                message: "Vendor order failed to send",
                tone: "danger",
                ttl: 6000,
              })
            }
          >
            Trigger a failure
          </button>
        </div>
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </div>
    );
  },
};
