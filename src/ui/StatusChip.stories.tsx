import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusChip } from "./primitives";

const meta: Meta<typeof StatusChip> = {
  title: "Primitives/StatusChip",
  component: StatusChip,
  parameters: {
    docs: {
      description: {
        component:
          "Outline chip with ink text; the tone is a leading icon (DESIGN.md `status-chip`, owner pick 2026-09-29). Tone comes from the event stage or `statusLabels.ts`.",
      },
    },
  },
  args: { status: "sales_lock" },
};
export default meta;
type Story = StoryObj<typeof StatusChip>;

export const Single: Story = {};

const STAGES = [
  "quote",
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
  "completed",
  "cancelled",
  "closed_out",
];

export const EventStages: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {STAGES.map((stage) => (
        <StatusChip key={stage} status={stage} />
      ))}
    </div>
  ),
};

const TONES = [
  "draft",
  "in_progress",
  "needs_review",
  "delivered",
  "overdue",
  "some_unknown_status",
];

export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {TONES.map((status) => (
        <StatusChip key={status} status={status} />
      ))}
    </div>
  ),
};

export const InATable: Story = {
  render: () => (
    <table className="w-full max-w-lg">
      <thead>
        <tr>
          <th className="th">Event</th>
          <th className="th">Stage</th>
        </tr>
      </thead>
      <tbody>
        {[
          ["Harlow–Reyes wedding", "sales_lock"],
          ["Meridian board lunch", "approved"],
          ["Fall tasting menu", "pending_approval"],
          ["Riverside gala", "cancelled"],
        ].map(([name, stage]) => (
          <tr key={name}>
            <td className="td">{name}</td>
            <td className="td">
              <StatusChip status={stage} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
};
