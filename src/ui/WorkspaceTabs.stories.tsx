import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { WorkspaceTabs } from "./WorkspaceTabs";

const meta: Meta<typeof WorkspaceTabs> = {
  title: "Navigation/WorkspaceTabs",
  component: WorkspaceTabs,
  parameters: {
    docs: {
      description: {
        component:
          "An area's tab strip. Daily destinations stay visible; occasional ones go under one More menu, which shows the open page's name when it is one of its items.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof WorkspaceTabs>;

const finance = {
  label: "Finance workspace",
  tabs: [
    { label: "Invoices", path: "/finance/invoices" },
    { label: "Payments", path: "/finance/payments" },
    { label: "Closeout", path: "/finance/closeout" },
    { label: "Payroll", path: "/finance/payroll" },
  ],
  more: [
    { label: "Tips", path: "/finance/tips" },
    { label: "Tax", path: "/finance/taxes" },
  ],
};

export const DailyTabActive: Story = {
  args: finance,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/finance/payments"]}>
        <Story />
      </MemoryRouter>
    ),
  ],
};

export const MoreItemActive: Story = {
  args: finance,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/finance/taxes"]}>
        <Story />
      </MemoryRouter>
    ),
  ],
};
