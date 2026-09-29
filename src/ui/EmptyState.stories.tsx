import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "./primitives";

const meta: Meta<typeof EmptyState> = {
  title: "Primitives/EmptyState",
  component: EmptyState,
  parameters: {
    docs: {
      description: {
        component:
          "Empty state variant B, “Next steps list” (owner pick, component picker 2026-09-29). Left-aligned bold title, hint, and — only when the page's data shows them — numbered next steps. Done steps show an ok check; open steps carry their own action.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="card max-w-xl">
        <Story />
      </div>
    ),
  ],
  args: {
    title: "No guests invited",
    hint: "Invite the first guest to begin attendance planning.",
  },
};
export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Plain: Story = {};

export const WithAction: Story = {
  args: {
    title: "No pack list templates yet",
    hint: "Save a template once, then start every event's pack list from it.",
    action: (
      <button type="button" className="btn btn-primary">
        New template
      </button>
    ),
  },
};

export const WithSteps: Story = {
  args: {
    title: "No prep tasks yet",
    hint: "Prep appears once the kitchen has what it needs from the menu.",
    steps: [
      { label: "Menu added", done: true },
      {
        label: "Set portions per item",
        action: (
          <button type="button" className="btn btn-ghost btn-sm">
            Set
          </button>
        ),
      },
      {
        label: "Lock menu for the kitchen",
        action: (
          <button type="button" className="btn btn-ghost btn-sm">
            Lock
          </button>
        ),
      },
    ],
  },
};
