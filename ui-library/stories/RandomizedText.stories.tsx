import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { libraryFrame } from "../LibraryFrame";
import { RandomizedTextEffect } from "../components/randomized-text-effect";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Randomized Text",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Randomized Text (https://ui-layouts.com/components/randomized-text-effect): text starts as random characters and settles into the real text, letter by letter.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

function Demo() {
  const [run, setRun] = useState(0);
  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <h1 className="text-5xl font-semibold font-mono">
        <RandomizedTextEffect key={run} text="Chef's table, Saturday" />
      </h1>
      <button
        type="button"
        className="rounded-md border px-3 py-1 text-sm"
        onClick={() => setRun((n) => n + 1)}
      >
        Replay
      </button>
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };
