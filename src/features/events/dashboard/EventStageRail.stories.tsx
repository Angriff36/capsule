import type { Meta, StoryObj } from "@storybook/react-vite";
import { STAGE_LABEL } from "../eventStatus";
import { DASH_TRACK } from "./eventDashFacts";
import { eventStageGate, type StageGateFacts } from "./eventStageGate";
import { EventStageRail, type StageRailGate } from "./EventStageRail";
import "./EventDashboard.css";

/**
 * The event page's stage rail. Every story runs its facts through the same
 * `eventStageGate` the event page uses, so the checks shown here are the
 * checks the app computes — plain props, no backend.
 */
const meta: Meta<typeof EventStageRail> = {
  title: "Compositions/EventStageRail",
  component: EventStageRail,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div className="evd" style={{ padding: 0, background: "transparent" }}>
        <div className="evd-pipe">
          <Story />
        </div>
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof EventStageRail>;

const STEPS = DASH_TRACK.map((stage) => STAGE_LABEL[stage]);

/** The rail's gate for these facts; fixes log instead of navigating. */
function gateFor(facts: StageGateFacts): StageRailGate | null {
  const gate = eventStageGate(facts);
  if (!gate) return null;
  return {
    nextLabel: gate.nextLabel,
    checks: gate.checks?.map(({ fix, ...check }) => ({
      ...check,
      fix: fix
        ? {
            label: fix.label,
            onFix: () => console.info("fix", check.key, fix.to),
          }
        : undefined,
    })),
  };
}

const railFor = (facts: StageGateFacts) => ({
  steps: STEPS,
  current: DASH_TRACK.indexOf(facts.stage as (typeof DASH_TRACK)[number]),
  gate: gateFor(facts),
});

const planned = {
  plannedAt: Date.UTC(2026, 8, 2),
  clientId: "client-1",
  hasAssignedClient: true,
  startsAt: Date.UTC(2026, 9, 17, 22),
  endsAt: Date.UTC(2026, 9, 18, 3),
  expectedHeadcount: 140,
  hasMenuDishes: true,
  hasStaffAssigned: true,
};

/** A new inquiry: returning it to planning has no data checks. */
export const Early: Story = {
  args: railFor({ stage: "quote" }),
};

/** An imported draft in planning: the plan and setup are still open. */
export const PlanningOpen: Story = {
  name: "Planning, plan unfinished",
  args: railFor({
    stage: "planning",
    plannedAt: null,
    expectedHeadcount: 0,
  }),
};

/** Sales lock: 2 of 3 execution checks open (prep and packing). */
export const SalesLock: Story = {
  name: "Sales lock, 2 checks open",
  args: railFor({
    stage: "sales_lock",
    ...planned,
    execution: {
      prepTaskIds: ["prep-1", "prep-2", "prep-3"],
      packListIds: ["pack-1"],
      deliveryIds: [],
    },
  }),
};

/** Executing: 2 of 4 Final Lock checks open (style and timing). */
export const Executing: Story = {
  name: "Executing, 2 of 4 open",
  args: railFor({
    stage: "executing",
    ...planned,
    hasServiceStyle: false,
    hasFinalLockTiming: false,
  }),
};

/** Sales lock while the live checks load. */
export const Loading: Story = {
  args: railFor({ stage: "sales_lock", ...planned }),
};

/** Closed out: every step done, nothing left to gate. */
export const Complete: Story = {
  args: railFor({ stage: "closed_out", ...planned }),
};
