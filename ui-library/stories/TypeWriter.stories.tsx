import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { libraryFrame } from "../LibraryFrame";
import { TypeWritter } from "../components/type-writer";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Type Writer",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Type Writer (https://ui-layouts.com/components/type-writer): types a line out one character at a time with a blinking caret, then calls onComplete.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

function Demo() {
  const [key, setKey] = useState(0);
  return (
    <div className="p-10 flex flex-col gap-5 max-w-3xl mx-auto bg-black">
      <TypeWritter
        key={key}
        text="New Role Detected"
        onComplete={() => setTimeout(() => setKey((prev) => prev + 1), 1500)}
      />
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };
