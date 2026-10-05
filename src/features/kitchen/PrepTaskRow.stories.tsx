import type { Meta, StoryObj } from "@storybook/react-vite";
import { PrepTaskRow, type PrepTaskRowProps } from "./PrepTaskRow";

/** A fixed clock so "late" reads the same on every render. */
const NOW = new Date(2026, 8, 29, 9, 27).getTime();
const at = (hour: number, minute: number) =>
  new Date(2026, 8, 29, hour, minute).getTime();

const meta: Meta<typeof PrepTaskRow> = {
  title: "Compositions/PrepTaskRow",
  component: PrepTaskRow,
  parameters: {
    docs: {
      description: {
        component:
          "Kitchen prep task, variant A (Checklist rows, owner pick 2026-09-29). A 28px checkbox runs the prep task Done command; it stays disabled with the reason until the task is in progress. The due time turns red when it has passed.",
      },
    },
  },
  args: {
    name: "Dice shallots",
    quantity: 12,
    unit: "pound",
    context: "Short rib jus",
    station: "Garde manger",
    dueAt: at(11, 0),
    status: "pending",
    now: NOW,
    onComplete: () => undefined,
  },
  decorators: [
    (Story) => (
      <ul className="max-w-xl list-none overflow-hidden rounded-ledger border border-line bg-panel p-0">
        <Story />
      </ul>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PrepTaskRow>;

const actions = (label: string) => (
  <button type="button" className="btn btn-ghost btn-sm min-h-11">
    {label}
  </button>
);

export const Open: Story = {
  args: { children: actions("Claim") },
};

export const Done: Story = {
  args: { status: "completed", dueAt: at(9, 30) },
};

export const Late: Story = {
  args: {
    name: "Portion halibut",
    quantity: 54,
    unit: "portion",
    context: "Mains",
    station: "Fish station",
    status: "in_progress",
    dueAt: at(9, 15),
  },
};

export const InProgress: Story = {
  name: "In progress",
  args: {
    name: "Pipe gougères",
    quantity: 360,
    unit: "each",
    context: "Passed",
    station: "Pastry",
    status: "in_progress",
    dueAt: at(11, 0),
    children: (
      <p className="text-base text-ink-2">
        Pipe 1 inch rounds; egg wash just before the oven.
      </p>
    ),
  },
};

const LIST: PrepTaskRowProps[] = [
  {
    name: "Dice shallots",
    quantity: 12,
    unit: "pound",
    context: "Short rib jus",
    station: "Garde manger",
    dueAt: at(9, 0),
    status: "completed",
    now: NOW,
  },
  {
    name: "Portion halibut",
    quantity: 54,
    unit: "portion",
    context: "Mains",
    station: "Fish station",
    dueAt: at(9, 15),
    status: "in_progress",
    now: NOW,
  },
  {
    name: "Pick chervil",
    quantity: 0.5,
    unit: "pound",
    context: "Halibut garnish",
    station: "Garde manger",
    dueAt: at(10, 0),
    status: "claimed",
    now: NOW,
    children: actions("Start"),
  },
  {
    name: "Pipe gougères",
    quantity: 360,
    unit: "each",
    context: "Passed",
    station: "Pastry",
    dueAt: at(11, 0),
    status: "pending",
    now: NOW,
    children: actions("Claim"),
  },
  {
    name: "Reduce veal stock",
    quantity: 2,
    unit: "gallon",
    context: "Short rib jus",
    station: "Hot line",
    dueAt: at(12, 30),
    status: "blocked",
    blockReason: "Waiting on the bones delivery",
    now: NOW,
  },
];

export const FiveRowList: Story = {
  name: "5-row list",
  render: () => (
    <>
      {LIST.map((row) => (
        <PrepTaskRow key={row.name} {...row} onComplete={() => undefined} />
      ))}
    </>
  ),
};
