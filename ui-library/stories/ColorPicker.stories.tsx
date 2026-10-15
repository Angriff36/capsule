import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { useState } from "react";
import { Toaster } from "sonner";
import { ColorPicker } from "../components/color-picker";
import { RawsColorPicker } from "../components/color-picker-raws";

const meta: Meta = {
  title: "UI Layouts Library/Forms/Color Picker",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Color Picker (https://ui-layouts.com/components/color-picker): a color swatch that opens a hex picker with a copy button and an optional eyedropper. The Raws variant draws its own picker.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

function ColorPickerDemo() {
  const [color, setColor] = useState("#002fff");
  const [color2, setColor2] = useState("#ff3c00");
  return (
    <div className="flex flex-col gap-2 items-center justify-center ">
      <Toaster />
      <ColorPicker
        color={color}
        onChange={(next) => setColor(next)}
        label="Pick A Color"
      />
      <ColorPicker
        color={color2}
        onChange={(next) => setColor2(next)}
        label="Pick A Color With EyeDropper"
        isEyeDroppper
      />
    </div>
  );
}

function RawsDemo() {
  return (
    <>
      <Toaster />
      <RawsColorPicker />
    </>
  );
}

export const Default: Story = { render: () => <ColorPickerDemo /> };
export const Raws: Story = { render: () => <RawsDemo /> };
