import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatCard } from "./StatCard";

const meta: Meta<typeof StatCard> = {
  title: "Charts/StatCard",
  component: StatCard,
  parameters: {
    docs: {
      description: {
        component:
          "Stat tiles variant B, “Tiles with trend line” (owner pick, component picker 2026-09-29). Paper tile, ink-2 label, big mono number. The sparkline draws only when the page passes a real series as `trend`; tone colors the line and icon, never the tile.",
      },
    },
  },
  args: {
    title: "Guests served",
    main: { value: 1240, format: "number" },
    tone: "accent",
  },
};
export default meta;
type Story = StoryObj<typeof StatCard>;

export const WithoutTrend: Story = {
  args: {
    rows: [
      { label: "Events", value: 14, format: "number" },
      { label: "Avg value", value: 8420, format: "currency" },
    ],
  },
};

export const WithTrend: Story = {
  args: {
    trend: {
      points: [880, 860, 940, 910, 1030, 1010, 1150, 1240],
      startLabel: "Aug 11",
      endLabel: "This week",
    },
  },
};

export const FourUp: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Guests served"
        main={{ value: 1240, format: "number" }}
        tone="accent"
        trend={{
          points: [880, 860, 940, 910, 1030, 1010, 1150, 1240],
          startLabel: "Aug 11",
          endLabel: "This week",
        }}
      />
      <StatCard
        title="Food cost"
        main={{ value: 31.4, format: "percent" }}
        tone="warn"
        trend={{
          points: [28.2, 28.9, 27.6, 29.8, 29.1, 30.2, 30.8, 31.4],
          startLabel: "Aug 11",
          endLabel: "Target 30%",
        }}
      />
      <StatCard
        title="Staff hours"
        main={{ value: 412, format: "number" }}
        tone="ok"
        trend={{
          points: [448, 430, 438, 404, 412, 430, 420, 412],
          startLabel: "Aug 11",
          endLabel: "This week",
        }}
      />
      <StatCard
        title="Open checks"
        main={{ value: 7, format: "number" }}
        rows={[{ label: "Due today", value: 2, format: "number" }]}
        isLive
      />
    </div>
  ),
};
