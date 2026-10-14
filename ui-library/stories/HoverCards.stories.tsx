import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import StripeDemo from "../components/hover-cards-stripe";
import CreativeDemo from "../components/hover-cards-creative";
import Stripe2Demo from "../components/hover-cards-stripe2";
import Card1Demo from "../components/hover-cards-1";
import Card2Demo from "../components/hover-cards-2";
import Card3Demo from "../components/hover-cards-3";
import Card4Demo from "../components/hover-cards-4";

const meta: Meta = {
  title: "UI Layouts Library/Cards & Highlights/Hover Cards",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Hover Cards (https://ui-layouts.com/components/hover-cards): Card designs with hover animations.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Stripe: Story = { render: () => <StripeDemo /> };
export const Creative: Story = { render: () => <CreativeDemo /> };
export const Stripe2: Story = { render: () => <Stripe2Demo /> };
export const Card1: Story = { render: () => <Card1Demo /> };
export const Card2: Story = { render: () => <Card2Demo /> };
export const Card3: Story = { render: () => <Card3Demo /> };
export const Card4: Story = { render: () => <Card4Demo /> };
