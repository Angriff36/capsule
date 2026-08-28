import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  CoverageGrid,
  ServiceTimeline,
  StageBoard,
  StageRail,
  type CoverageCell,
} from "./schedule";

const meta: Meta = {
  title: "Next/Scheduling",
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj;

/* ------------------------------------------------------------------ StageRail */

export const Rail: Story = {
  name: "StageRail",
  parameters: {
    docs: {
      description: {
        story:
          "**New.** The nine stages are currently a row of dots that shows position and nothing else. A chevron rail can carry what each stage is waiting on, and mark the current one blocked.",
      },
    },
  },
  render: () => {
    const [current, setCurrent] = useState("sales_lock");
    const stages = [
      { id: "quote", label: "Quote" },
      { id: "planning", label: "Planning" },
      { id: "approval", label: "Approval" },
      { id: "approved", label: "Approved" },
      {
        id: "sales_lock",
        label: "Sales lock",
        note: "2 checks open",
        blocked: true,
      },
      { id: "executing", label: "Executing" },
      { id: "final", label: "Final" },
      { id: "completed", label: "Completed" },
      { id: "closed", label: "Closed out" },
    ];
    return (
      <div style={{ display: "grid", gap: 22 }}>
        <StageRail stages={stages} current={current} onSelect={setCurrent} />
        <StageRail
          stages={stages.map((s) => ({
            ...s,
            blocked: false,
            note: undefined,
          }))}
          current="planning"
        />
      </div>
    );
  },
};

/* ----------------------------------------------------------------- StageBoard */

export const Board: Story = {
  name: "StageBoard",
  parameters: {
    docs: {
      description: {
        story:
          "**New.** Drag a card to change its stage. Column counts flag overload — eleven events parked in Approval is a signal a list view buries.",
      },
    },
  },
  render: () => {
    const [cards, setCards] = useState([
      {
        id: "1",
        column: "planning",
        title: "Harrington Annual Gala",
        meta: "Aug 16 · 280",
        flags: [{ label: "Menu locked", tone: "ok" as const }],
      },
      {
        id: "2",
        column: "planning",
        title: "Colefax Wedding",
        meta: "Sep 02 · 140",
        flags: [{ label: "No coordinator", tone: "warn" as const }],
      },
      {
        id: "3",
        column: "approval",
        title: "Peregula Tasting",
        meta: "Today · 10",
      },
      {
        id: "4",
        column: "approval",
        title: "Garden Party",
        meta: "Sep 10 · 40",
        flags: [{ label: "Budget over", tone: "danger" as const }],
      },
      {
        id: "5",
        column: "approval",
        title: "Meridian Launch",
        meta: "Sep 18 · 220",
      },
      {
        id: "6",
        column: "approved",
        title: "Ashcroft Retirement",
        meta: "Aug 30 · 60",
        flags: [{ label: "Staffed", tone: "ok" as const }],
      },
      {
        id: "7",
        column: "executing",
        title: "Bellweather Conference",
        meta: "Today · 450",
        flags: [{ label: "Live", tone: "info" as const }],
      },
    ]);
    return (
      <StageBoard
        limit={2}
        columns={[
          { id: "planning", label: "Planning" },
          { id: "approval", label: "Approval" },
          { id: "approved", label: "Approved" },
          { id: "executing", label: "Executing" },
          { id: "closed", label: "Closed out" },
        ]}
        cards={cards}
        onMove={(id, to) =>
          setCards((all) =>
            all.map((c) => (c.id === id ? { ...c, column: to } : c)),
          )
        }
      />
    );
  },
};

/* ------------------------------------------------------------ ServiceTimeline */

export const Timeline: Story = {
  name: "ServiceTimeline",
  parameters: {
    docs: {
      description: {
        story:
          "**New — and the biggest gap.** A catering day is lanes competing for the same hours: prep, load-out, staff call, service, strike. A list cannot show that they overlap. Blocks sit on a real minute scale with a now-line; the red block is a conflict.",
      },
    },
  },
  render: () => (
    <ServiceTimeline
      now={13 * 60 + 20}
      lanes={["Kitchen", "Pastry", "Logistics", "Front of house", "Venue"]}
      blocks={[
        {
          id: "a",
          lane: "Kitchen",
          label: "Butchery & mise",
          start: 6 * 60,
          end: 10 * 60,
          kind: "prep",
        },
        {
          id: "b",
          lane: "Kitchen",
          label: "Hot line prep",
          start: 10 * 60,
          end: 15 * 60,
          kind: "prep",
        },
        {
          id: "c",
          lane: "Kitchen",
          label: "Service — mains",
          start: 19 * 60,
          end: 21 * 60,
          kind: "service",
        },
        {
          id: "d",
          lane: "Pastry",
          label: "Poached pear",
          start: 7 * 60,
          end: 11 * 60,
          kind: "prep",
        },
        {
          id: "e",
          lane: "Pastry",
          label: "Petit fours",
          start: 11 * 60,
          end: 14 * 60,
          kind: "prep",
        },
        {
          id: "f",
          lane: "Logistics",
          label: "Van load",
          start: 14 * 60,
          end: 15 * 60 + 30,
          kind: "move",
        },
        {
          id: "g",
          lane: "Logistics",
          label: "Drive + load-in",
          start: 15 * 60 + 30,
          end: 17 * 60,
          kind: "move",
        },
        {
          id: "h",
          lane: "Logistics",
          label: "Strike",
          start: 22 * 60,
          end: 23 * 60 + 30,
          kind: "move",
        },
        {
          id: "i",
          lane: "Front of house",
          label: "Staff call — 22",
          start: 16 * 60,
          end: 17 * 60,
          kind: "prep",
        },
        {
          id: "j",
          lane: "Front of house",
          label: "Cocktail hour",
          start: 17 * 60,
          end: 19 * 60,
          kind: "service",
        },
        {
          id: "k",
          lane: "Front of house",
          label: "Dinner service",
          start: 19 * 60,
          end: 22 * 60,
          kind: "service",
        },
        {
          id: "l",
          lane: "Venue",
          label: "Room flip — 45m only",
          start: 16 * 60 + 30,
          end: 17 * 60 + 15,
          kind: "risk",
          detail: "Overlaps load-in",
        },
      ]}
    />
  ),
};

/* ---------------------------------------------------------------- CoverageGrid */

const lvl = (n: number): CoverageCell["level"] => n as CoverageCell["level"];

export const Coverage: Story = {
  name: "CoverageGrid",
  parameters: {
    docs: {
      description: {
        story:
          "**New.** app.css already declares `--capacity-*` tokens that nothing renders — this is the view they were for. Resource against day, shaded by load, so you can see Saturday is four servers short before anyone promises a client anything.",
      },
    },
  },
  render: () => (
    <CoverageGrid
      columns={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
      rows={[
        {
          label: "Chefs",
          cells: [1, 1, 2, 2, 3, 4, 2].map((n) => ({
            level: lvl(n),
            label: `${n * 2}/8`,
          })),
        },
        {
          label: "Servers",
          cells: [0, 1, 1, 2, 3, 4, 3].map((n) => ({
            level: lvl(n),
            label: `${n * 6}/24`,
          })),
        },
        {
          label: "Drivers",
          cells: [1, 1, 1, 2, 2, 3, 1].map((n) => ({
            level: lvl(n),
            label: `${n}/3`,
          })),
        },
        {
          label: "Vans",
          cells: [0, 1, 1, 1, 2, 4, 1].map((n) => ({
            level: lvl(n),
            label: `${n}/2`,
          })),
        },
        {
          label: "Ovens",
          cells: [1, 2, 2, 2, 3, 3, 1].map((n) => ({
            level: lvl(n),
            label: `${n}/4`,
          })),
        },
      ]}
    />
  ),
};
