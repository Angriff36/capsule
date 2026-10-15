import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { useState } from "react";
import { DualRangeSlider } from "../components/range-slider";

const meta: Meta = {
  title: "UI Layouts Library/Forms/Range Slider",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Range Slider (https://ui-layouts.com/components/range-slider): a dual-thumb slider whose thumbs show a rolling number label. Variants: dual range, label position, static label.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

function DualRange() {
  const [values, setValues] = useState([0, 100]);
  return (
    <div className=" w-3/5 mx-auto space-y-20 py-20">
      <DualRangeSlider
        label={() => <>℃</>}
        value={values}
        onValueChange={setValues}
        min={0}
        max={100}
        step={1}
      />
    </div>
  );
}

function Position() {
  const [celPer, setCelPer] = useState(70);
  const [values, setValues] = useState([0, 100]);
  return (
    <div className=" w-3/5 mx-auto space-y-20 py-20">
      <DualRangeSlider
        label={() => <>$</>}
        lableContenPos={"left"}
        value={values}
        onValueChange={setValues}
        min={0}
        max={100}
        step={1}
      />

      <DualRangeSlider
        label={() => <>℃</>}
        value={[celPer]}
        labelPosition="bottom"
        onValueChange={([next]) => next != null && setCelPer(next)}
        min={0}
        max={100}
        step={1}
      />
    </div>
  );
}

function Static() {
  const [celPer, setCelPer] = useState(70);
  return (
    <div className=" w-3/5 mx-auto py-20">
      <DualRangeSlider
        label={() => <>℃</>}
        value={[celPer]}
        labelPosition="static"
        onValueChange={([next]) => next != null && setCelPer(next)}
        min={0}
        max={100}
        step={1}
      />
    </div>
  );
}

export const Default: Story = { render: () => <DualRange /> };
export const LabelPosition: Story = { render: () => <Position /> };
export const StaticLabel: Story = { render: () => <Static /> };
