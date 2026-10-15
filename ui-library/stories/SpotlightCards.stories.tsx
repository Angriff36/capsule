import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import Card1Demo from "../components/spotlight-cards-1";
import Card2Demo from "../components/spotlight-cards-2";
import Card3Demo from "../components/spotlight-cards-3";
import Card4Demo from "../components/spotlight-cards-4";
import CruipDemo from "../components/spotlight-cards-cruip";

const meta: Meta = {
  title: "UI Layouts Library/Visual Effects/Spotlight Cards",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Spotlight Cards (https://ui-layouts.com/components/spotlight-cards): Cards with a cursor-following spotlight and border glow.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Card1: Story = { render: () => <Card1Demo /> };
export const Card2: Story = { render: () => <Card2Demo /> };
export const Card3: Story = { render: () => <Card3Demo /> };
export const Card4: Story = { render: () => <Card4Demo /> };
export const Cruip: Story = { render: () => <CruipDemo /> };
