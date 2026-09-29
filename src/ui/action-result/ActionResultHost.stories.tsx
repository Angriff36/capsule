import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ActionResultHost } from "./ActionResultHost";
import { ActionResultStore } from "./ActionResultStore";

/**
 * The host reads the shared store, so each story publishes a result on mount.
 * Results auto-dismiss (8s ok, 14s fail); use the buttons to show one again.
 */
function publish(kind: "ok" | "fail", message: string) {
  if (kind === "ok") ActionResultStore.shared.ok(message);
  else ActionResultStore.shared.fail(message);
}

function Demo({ kind, message }: { kind: "ok" | "fail"; message: string }) {
  useEffect(() => {
    publish(kind, message);
    return () => ActionResultStore.shared.dismiss();
  }, [kind, message]);
  return (
    <div className="grid max-w-2xl gap-3">
      <ActionResultHost />
      <div className="px-4">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => publish(kind, message)}
        >
          Show again
        </button>
      </div>
    </div>
  );
}

const meta: Meta<typeof Demo> = {
  title: "Primitives/ResultNotice",
  component: Demo,
  parameters: {
    docs: {
      description: {
        component:
          "Message after a command runs (DESIGN.md `result-notice`, owner pick 2026-09-29). Success is neutral with a check icon; failure takes the danger color because it blocks work.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof Demo>;

export const Success: Story = {
  args: { kind: "ok", message: "Deposit recorded: $4,860.00." },
};

export const Failure: Story = {
  args: {
    kind: "fail",
    message: "Couldn't lock for sales. 2 checks are still open.",
  },
};
