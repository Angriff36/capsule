import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { MergedSection } from "./MergedSection";

const meta: Meta<typeof MergedSection> = {
  title: "Primitives/MergedSection",
  component: MergedSection,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          "A screen folded into another page, shown as one row: title, one line of purpose, arrow. Shut by default (loads nothing); defaultOpen for queues people act on every visit. The old URL redirects to host#id, which opens and scrolls to it.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof MergedSection>;

export const Shut: Story = {
  args: {
    id: "retention",
    title: "Retention",
    summary:
      "Clients who booked last year but not this year, and the calls to win them back.",
    children: (
      <p className="text-sm text-ink-2">The folded screen renders here.</p>
    ),
  },
};

export const OpenQueue: Story = {
  args: {
    id: "time-off",
    title: "Time off",
    summary: "Requests waiting for a yes or no.",
    defaultOpen: true,
    children: (
      <p className="text-sm text-ink-2">The folded screen renders here.</p>
    ),
  },
};
