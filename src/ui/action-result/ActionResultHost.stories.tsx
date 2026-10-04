import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { ActionResultHost } from "./ActionResultHost";
import { dismissActionResult, reportActionOk } from "./ActionResultStore";

const meta: Meta<typeof ActionResultHost> = {
  title: "Primitives/Action result host",
  component: ActionResultHost,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ActionResultHost>;

function ResultDemo({ linked }: { linked: boolean }) {
  useEffect(() => {
    reportActionOk(
      linked
        ? "Event approved. Purchase planning is up to date."
        : "Vendor saved.",
      linked
        ? [
            {
              label: "View purchase needs",
              to: "/inventory/purchasing?event=event-1",
            },
          ]
        : undefined,
    );
    return dismissActionResult;
  }, [linked]);

  return <ActionResultHost />;
}

export const TextOnly: Story = {
  render: () => <ResultDemo linked={false} />,
};

export const LinkedAction: Story = {
  render: () => <ResultDemo linked />,
};
