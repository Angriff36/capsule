import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { libraryFrame } from "../LibraryFrame";
import { NewIntroSequence } from "../components/terminal-ui";

const meta: Meta = {
  title: "UI Layouts Library/Animation & Motion/Terminal UI",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Terminal UI (https://ui-layouts.com/components/terminal-ui): a scripted terminal intro that chains shimmer bars, typed lines and a closing message.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

function Demo() {
  const [run, setRun] = useState(0);
  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="button"
        className="rounded-md border px-3 py-1 text-sm"
        onClick={() => setRun((n) => n + 1)}
      >
        Replay
      </button>
      <NewIntroSequence key={run} className="rounded-md" />
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };
