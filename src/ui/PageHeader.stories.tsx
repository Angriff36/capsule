import type { Meta, StoryObj } from "@storybook/react-vite";
import { PageHeader } from "./primitives";

const meta: Meta<typeof PageHeader> = {
  title: "Primitives/PageHeader",
  component: PageHeader,
  parameters: {
    docs: {
      description: {
        component:
          'Editorial masthead (owner pick 2026-09-29, component picker variant B): uppercase eyebrow with the state word in accent, a large tight title, an optional row of facts on a strong ink rule, and the actions under it. `size="compact"` is the working bar for narrow frames.',
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof PageHeader>;

export const ListPage: Story = {
  args: {
    title: "Event templates",
    lead: "Named starting points for common event types — client type, headcount, menu, staff roles, and equipment pre-configured.",
    actions: (
      <>
        <button type="button" className="btn btn-primary">
          New template
        </button>
        <button type="button" className="btn btn-ghost">
          Show archived
        </button>
      </>
    ),
  },
};

export const DetailPage: Story = {
  args: {
    eyebrow: (
      <>
        Events / <b>Sales lock</b> · 12 days out
      </>
    ),
    title: "Harlow–Reyes wedding",
    facts: [
      { label: "Date", value: "Sat, Oct 11 · 5:30 pm" },
      { label: "Guests", value: 180 },
      { label: "Venue", value: "The Glasshouse" },
      { label: "Owner", value: "Dana Ruiz" },
    ],
    actions: (
      <>
        <button type="button" className="btn btn-primary">
          Lock for sales
        </button>
        <button type="button" className="btn btn-ghost">
          Edit details
        </button>
      </>
    ),
  },
};

export const Compact: Story = {
  args: {
    size: "compact",
    title: "My Day",
    lead: "Dana Ruiz · Line cook",
    actions: (
      <button type="button" className="btn btn-ghost btn-sm">
        Clock in
      </button>
    ),
  },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
};
