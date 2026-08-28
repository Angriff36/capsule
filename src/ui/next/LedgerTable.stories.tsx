import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LedgerTable } from "./LedgerTable";
import { InlineEdit, Money, Num, DecisionPrompt } from "./core";

const meta: Meta = {
  title: "Next/LedgerTable",
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component: [
          "**New.** Capsule has `.th`/`.td` and nothing else — no selection, sorting, grouping, totals, inline edit or keyboard.",
          "",
          "- click a row then use `j`/`k` (or arrows) to move the cursor, `x` to toggle, `a` to select all, `Esc` to clear",
          "- shift-click a checkbox to select a range",
          "- group rows carry their own subtotals; the totals row is sticky at the bottom",
          "- numeric columns are right-aligned tabular figures so they compare vertically",
        ].join("\n"),
      },
    },
  },
};
export default meta;
type Story = StoryObj;

interface Line {
  id: string;
  course: string;
  item: string;
  qty: number;
  unit: number;
  station: string;
}

const SEED: Line[] = [
  {
    id: "1",
    course: "Canapés",
    item: "Smoked trout tartlet",
    qty: 280,
    unit: 4.2,
    station: "Cold",
  },
  {
    id: "2",
    course: "Canapés",
    item: "Beetroot & chèvre",
    qty: 280,
    unit: 3.8,
    station: "Cold",
  },
  {
    id: "3",
    course: "Canapés",
    item: "Lamb kofta",
    qty: 200,
    unit: 5.1,
    station: "Grill",
  },
  {
    id: "4",
    course: "Main",
    item: "Plated dinner — beef",
    qty: 180,
    unit: 62,
    station: "Hot",
  },
  {
    id: "5",
    course: "Main",
    item: "Plated dinner — halibut",
    qty: 74,
    unit: 58,
    station: "Hot",
  },
  {
    id: "6",
    course: "Main",
    item: "Plated dinner — vegan",
    qty: 26,
    unit: 44,
    station: "Hot",
  },
  {
    id: "7",
    course: "Dessert",
    item: "Poached pear",
    qty: 280,
    unit: 11,
    station: "Pastry",
  },
  {
    id: "8",
    course: "Dessert",
    item: "Petit fours",
    qty: 280,
    unit: 6.5,
    station: "Pastry",
  },
];

function Demo({ grouped }: { grouped?: boolean }) {
  const [rows, setRows] = useState(SEED);
  const [picked, setPicked] = useState<string[]>([]);

  const setQty = (id: string, qty: number) =>
    setRows((all) => all.map((r) => (r.id === id ? { ...r, qty } : r)));

  return (
    <LedgerTable<Line>
      rows={rows}
      rowKey={(r) => r.id}
      selectable
      selected={picked}
      onSelectedChange={setPicked}
      showTotals
      maxHeight={grouped ? 420 : undefined}
      groupBy={grouped ? (r) => r.course : undefined}
      columns={[
        { key: "item", header: "Line item", sortable: true },
        { key: "station", header: "Station", sortable: true, width: 110 },
        {
          key: "qty",
          header: "Qty",
          numeric: true,
          sortable: true,
          total: true,
          width: 110,
          value: (r) => r.qty,
          render: (r) => (
            <InlineEdit
              value={r.qty}
              numeric
              label={`Quantity for ${r.item}`}
              format={(v) => <Num value={Number(v)} />}
              validate={(next) => {
                const n = Number(next);
                if (!Number.isFinite(n)) return "Numbers only";
                if (n < 0) return "Cannot be negative";
                if (n > 500) return "Over venue capacity";
                return undefined;
              }}
              onCommit={(next) => setQty(r.id, Number(next))}
            />
          ),
        },
        {
          key: "unit",
          header: "Unit",
          numeric: true,
          sortable: true,
          width: 100,
          value: (r) => r.unit,
          render: (r) => <Money value={r.unit} cents />,
        },
        {
          key: "total",
          header: "Total",
          numeric: true,
          total: true,
          width: 120,
          value: (r) => Math.round(r.qty * r.unit),
          render: (r) => <Money value={Math.round(r.qty * r.unit)} />,
        },
      ]}
      bulkActions={(ids) => (
        <>
          <button>Move to station</button>
          <button>Recost</button>
          <DecisionPrompt
            title={`Remove ${ids.length} lines?`}
            body="They come off the BEO and the purchase demand recalculates."
            consequence="Two of these are already on a submitted vendor order."
            confirmLabel="Remove lines"
            tone="danger"
            onConfirm={() => {
              setRows((all) => all.filter((r) => !ids.includes(r.id)));
              setPicked([]);
            }}
            trigger={(p) => <button {...p}>Remove</button>}
          />
        </>
      )}
    />
  );
}

export const Working: Story = {
  name: "Selection, sort, inline edit",
  render: () => <Demo />,
};

export const Grouped: Story = {
  name: "Grouped by course, with subtotals",
  render: () => <Demo grouped />,
};

export const Empty: Story = {
  render: () => (
    <LedgerTable<Line>
      rows={[]}
      rowKey={(r) => r.id}
      columns={[
        { key: "item", header: "Line item" },
        { key: "qty", header: "Qty", numeric: true },
      ]}
      empty="No menu lines yet — add a course to start costing this event."
    />
  ),
};
