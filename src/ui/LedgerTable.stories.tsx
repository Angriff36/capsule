import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusChip } from "./primitives";

/**
 * Ledger table grammar (DESIGN.md `ledger-table`, owner pick 2026-09-29).
 * There is no component: tables use the `.th` / `.td` classes, or the
 * `.data-table` class on the <table>. Numbers are right-aligned mono.
 */
const meta: Meta = {
  title: "Primitives/LedgerTable",
};
export default meta;
type Story = StoryObj;

const LINES = [
  ["Braised short rib", "Red wine jus, gremolata", 120, 9.4, "approved"],
  ["Seared halibut", "Beurre blanc, 6 oz", 54, 12.15, "needs_review"],
  ["Wild mushroom risotto", "Vegan, nut-free", 6, 4.8, "approved"],
] as const;

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export const ThTd: Story = {
  render: () => (
    <table className="w-full max-w-3xl">
      <thead>
        <tr>
          <th className="th">Item</th>
          <th className="th text-right">Portions</th>
          <th className="th text-right">Unit cost</th>
          <th className="th text-right">Line</th>
          <th className="th">Status</th>
        </tr>
      </thead>
      <tbody>
        {LINES.map(([name, note, qty, unit, status]) => (
          <tr key={name}>
            <td className="td">
              <span className="block font-semibold">{name}</span>
              <span className="text-sm text-ink-3">{note}</span>
            </td>
            <td className="td text-right font-mono">{qty}</td>
            <td className="td text-right font-mono">{money(unit)}</td>
            <td className="td text-right font-mono">{money(qty * unit)}</td>
            <td className="td">
              <StatusChip status={status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
};

export const DataTable: Story = {
  render: () => (
    <table className="data-table w-full max-w-3xl">
      <thead>
        <tr>
          <th>Item</th>
          <th className="text-right">Portions</th>
          <th className="text-right">Line</th>
        </tr>
      </thead>
      <tbody>
        {LINES.map(([name, , qty, unit]) => (
          <tr key={name}>
            <td>{name}</td>
            <td className="text-right font-mono">{qty}</td>
            <td className="text-right font-mono">{money(qty * unit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
};
