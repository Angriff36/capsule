import {
  useShiftTypeReactivate,
  useShiftTypeRetire,
  useTrainingModuleReactivate,
  useTrainingModuleRetire,
} from "../../lib/manifest-convex-react";
import type { ActionPromptSession } from "../../ui/action-prompt";

/**
 * Retire / Reactivate on a training module row and on a shift type row.
 * Both pairs run the governed commands. Retiring takes a module or a type out
 * of scheduling, so it asks first; reactivating puts it back and saves at once.
 * Neither command takes a reason.
 */

type LifecycleRow = Readonly<{
  _id: string;
  version?: number;
  name?: unknown;
  status?: unknown;
}>;

type LifecycleProps = Readonly<{
  row: LifecycleRow;
  prompt: ActionPromptSession;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
}>;

function LifecycleButtons({
  row,
  prompt,
  busy,
  run,
  noun,
  retire,
  reactivate,
}: LifecycleProps &
  Readonly<{
    noun: string;
    retire: (args: Record<string, unknown>) => Promise<unknown>;
    reactivate: (args: Record<string, unknown>) => Promise<unknown>;
  }>) {
  const status = String(row.status);
  const name = String(row.name ?? "").trim() || `this ${noun}`;
  const args = { docId: row._id, version: row.version };
  const retireKey = `${row._id}:retire`;
  const reactivateKey = `${row._id}:reactivate`;

  if (status === "retired") {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy != null}
        onClick={() =>
          void run(reactivateKey, async () => {
            await reactivate(args);
          })
        }
      >
        {busy === reactivateKey ? "Working…" : "Reactivate"}
      </button>
    );
  }

  if (status !== "active") return null;

  const onRetire = () => {
    void (async () => {
      const confirmed = await prompt.askConfirm({
        title: `Retire ${noun}`,
        description: `${name} stops being offered on new work. Anything that already uses it keeps it.`,
        confirmLabel: `Retire ${noun}`,
        tone: "danger",
      });
      if (!confirmed) return;
      await run(retireKey, async () => {
        await retire(args);
      });
    })();
  };

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={busy != null}
      onClick={onRetire}
    >
      {busy === retireKey ? "Working…" : "Retire"}
    </button>
  );
}

export function TrainingModuleLifecycleAction(props: LifecycleProps) {
  const retire = useTrainingModuleRetire();
  const reactivate = useTrainingModuleReactivate();
  return (
    <LifecycleButtons
      {...props}
      noun="module"
      retire={retire}
      reactivate={reactivate}
    />
  );
}

export function ShiftTypeLifecycleAction(props: LifecycleProps) {
  const retire = useShiftTypeRetire();
  const reactivate = useShiftTypeReactivate();
  return (
    <LifecycleButtons
      {...props}
      noun="shift type"
      retire={retire}
      reactivate={reactivate}
    />
  );
}
