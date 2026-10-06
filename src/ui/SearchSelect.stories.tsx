import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SearchSelect, type SearchSelectOption } from "./SearchSelect";

const meta: Meta<typeof SearchSelect> = {
  title: "Controls/SearchSelect",
  component: SearchSelect,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Type-ahead picker for foreign-key fields (dish, ingredient, client, vendor, staff). Typing fuzzy-ranks options (start-of-name matches first, letters-in-order still match); arrow keys move, Enter picks, Escape closes. Pass `recentsKey` to pin this browser's five most recent picks at the top. Pass `name` for FormData forms; omit `value` and use `defaultValue` for an uncontrolled field. See docs/design/component-catalog.md.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof SearchSelect>;

const dishes: SearchSelectOption[] = [
  "Chicken Piccata",
  "Chicken Marsala",
  "Grilled Salmon",
  "Caesar Salad",
  "Penne alla Vodka",
  "Roasted Vegetables",
  "Beef Tenderloin",
  "Shrimp Cocktail",
].map((label, index) => ({ id: `dish-${index}`, label }));

function Controlled() {
  const [value, setValue] = useState("");
  return (
    <label className="field-label w-80">
      Dish
      <SearchSelect
        options={dishes}
        value={value}
        onChange={setValue}
        recentsKey="storybook-dish"
        placeholder="Search dishes…"
      />
    </label>
  );
}

export const DishPicker: Story = { render: () => <Controlled /> };

export const WithHints: Story = {
  render: () => (
    <label className="field-label w-80">
      Client
      <SearchSelect
        name="clientId"
        options={[
          { id: "c1", label: "Kamini Singh", hint: "kamini@example.com" },
          { id: "c2", label: "Singh Campsite", hint: "Route 9, Lakeview" },
          { id: "c3", label: "Ashley Moore", hint: "ashley@example.com" },
        ]}
        placeholder="Search clients…"
      />
    </label>
  ),
};
