import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReasonCopy } from "./ReasonCopy";
import { useActionPrompt } from "./useActionPrompt";

type Variant =
  "confirm" | "destructive-reason" | "supersede-demand" | "submitting";

/**
 * Drives the real hook with no Convex. Each story opens its prompt on mount;
 * the trigger button reopens it after Cancel / Confirm so focus return and
 * the dismissal notice can be checked by hand.
 */
function Demo({ variant }: { variant: Variant }) {
  const { prompt, host } = useActionPrompt(variant === "submitting");
  const [last, setLast] = useState<string | null>(null);

  const open = async () => {
    if (variant === "confirm") {
      const ok = await prompt.askConfirm({
        title: "Send proposal to client",
        description:
          "The client receives the proposal by email and can accept it online.",
        confirmLabel: "Send proposal",
        cancelLabel: "Not yet",
      });
      setLast(ok ? "Confirmed" : null);
      return;
    }
    if (variant === "destructive-reason") {
      const reason = await prompt.askReason({
        ...ReasonCopy.cancelShift,
        tone: "danger",
      });
      setLast(reason ? `Reason: ${reason}` : null);
      return;
    }
    if (variant === "supersede-demand") {
      const reason = await prompt.askReason({
        ...ReasonCopy.supersedeDemand,
        tone: "danger",
      });
      setLast(reason ? `Reason: ${reason}` : null);
      return;
    }
    await prompt.askReason({ ...ReasonCopy.voidInvoice, tone: "danger" });
  };

  useEffect(() => {
    void open();
    // Open once on mount; the button reopens it.
  }, []);

  return (
    <div className="grid max-w-xl gap-3">
      <p className="text-sm text-ink-2">
        Governed command step. The prompt opens as a modal alert dialog.
      </p>
      <div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void open()}
        >
          Open prompt
        </button>
      </div>
      {last ? <p className="text-sm text-ink">{last}</p> : null}
      {host}
    </div>
  );
}

const meta: Meta<typeof Demo> = {
  title: "Primitives/ActionPrompt",
  component: Demo,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Confirm / reason-required step before a governed command runs. Origin UI Alert Dialog pattern on a native modal `<dialog>`: focus moves in (first field, else Cancel), Tab is trapped, Esc and scrim click cancel unless a submit is in flight, focus returns to the trigger.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof Demo>;

export const SimpleConfirm: Story = { args: { variant: "confirm" } };

export const DestructiveWithReason: Story = {
  args: { variant: "destructive-reason" },
};

export const SupersedeDemandReason: Story = {
  args: { variant: "supersede-demand" },
};

export const Submitting: Story = { args: { variant: "submitting" } };
