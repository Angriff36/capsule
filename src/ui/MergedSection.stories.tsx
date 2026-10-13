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
          "A screen folded into another screen. One h2 title and an anchor; the old URL redirects to `host#id` and the section scrolls into view.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof MergedSection>;

export const FoldedQueue: Story = {
  args: {
    id: "time-off",
    title: "Time off",
    lead: "Requests waiting for a decision come first.",
    children: (
      <p className="text-sm text-ink-2">The folded screen renders here.</p>
    ),
  },
};
