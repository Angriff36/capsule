import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import Card1Demo from "../components/product-cards-1";
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
          "ui-layouts Product Cards (https://ui-layouts.com/components/product-cards): Product card layouts. Cards 2 and 3 need extra packages (@radix-ui/react-select, embla-carousel) and are not ported.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

export const Card1: Story = { render: () => <Card1Demo /> };
export const Card4: Story = { render: () => <Card4Demo /> };
export const Card5: Story = { render: () => <Card5Demo /> };
export const Card6: Story = { render: () => <Card6Demo /> };
