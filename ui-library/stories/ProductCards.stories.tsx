import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import Card1Demo from "../components/product-cards-1";
import Card2Demo from "../components/product-cards-2";
import Card3Demo from "../components/product-cards-3";
import Card4Demo from "../components/product-cards-4";
import Card5Demo from "../components/product-cards-5";
import Card6Demo from "../components/product-cards-6";

const meta: Meta = {
  title: "UI Layouts Library/Cards & Highlights/Product Cards",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Product Cards (https://ui-layouts.com/components/product-cards): Product card layouts. Cards 1 to 6.",
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
export const Card5: Story = { render: () => <Card5Demo /> };
export const Card6: Story = { render: () => <Card6Demo /> };
