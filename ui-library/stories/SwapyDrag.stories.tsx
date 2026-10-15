import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import {
  DragHandle,
  SwapyItem,
  SwapyLayout,
  SwapySlot,
} from "../components/swapy";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Swapy Drag",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Swapy Drag (https://ui-layouts.com/components/swapy): drag-to-swap layouts powered by Swapy. Drag an item onto another slot to swap them.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

const cardClass =
  "relative flex h-24 items-center justify-center rounded-md border bg-card p-4 text-center text-sm font-medium";
const slotClass = "rounded-md";

const handleItems = [
  "Turbocharge Everything",
  "Brainy Decisions",
  "Magical Moments",
  "Innovate Like Crazy",
  "Save Big, Smile More",
  "AI Vibes Only",
];
const opacityItems = [
  "Streamline Operations",
  "Decision Making",
  "Customer Experiences",
  "Accelerate Innovation",
  "Reduce Costs",
  "Future-Proof",
];
const rowItems = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

export const Handle: Story = {
  render: () => (
    <SwapyLayout id="swapy-handle" className="grid grid-cols-3 gap-3">
      {handleItems.map((item, i) => (
        <SwapySlot key={item} id={`slot-${i}`} className={slotClass}>
          <SwapyItem id={`item-${i}`}>
            <div className={cardClass}>
              <DragHandle />
              {item}
            </div>
          </SwapyItem>
        </SwapySlot>
      ))}
    </SwapyLayout>
  ),
};

export const Opacity: Story = {
  render: () => (
    <SwapyLayout id="swapy-opacity" className="grid grid-cols-3 gap-3">
      {opacityItems.map((item, i) => (
        <SwapySlot key={item} id={`slot-${i}`} className={slotClass}>
          <SwapyItem id={`item-${i}`} dragItemOpacity={50}>
            <div className={`${cardClass} cursor-grab`}>{item}</div>
          </SwapyItem>
        </SwapySlot>
      ))}
    </SwapyLayout>
  ),
};

export const Rows: Story = {
  render: () => (
    <SwapyLayout id="swapy-rows" className="flex flex-col gap-3">
      {[0, 1, 2].map((row) => (
        <div key={row} className="grid grid-cols-3 gap-3">
          {rowItems.slice(row * 3, row * 3 + 3).map((item) => (
            <SwapySlot key={item} id={`slot-${item}`} className={slotClass}>
              <SwapyItem id={`item-${item}`}>
                <div className={`${cardClass} cursor-grab`}>{item}</div>
              </SwapyItem>
            </SwapySlot>
          ))}
        </div>
      ))}
    </SwapyLayout>
  ),
};
