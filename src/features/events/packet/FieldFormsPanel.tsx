import { useEffect, useState } from "react";
import type { Id } from "../../../lib/api";
import {
  FIELD_FORM_KEYS,
  fieldFormLateness,
} from "../../../lib/eventPacket/finalLock/fieldForms";
import {
  useEventFieldForms,
  type FieldFormRow,
} from "../../../lib/eventPacket/useFieldForms";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { FailureBanner } from "../FailureBanner";
import { FieldFormCard } from "./FieldFormCard";

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * The event's day-of forms: who is down to do each, when it is due, who
 * signed it, and a way to chase a late one. Setting them up names people
 * and times; it never marks anything done.
 */
export function FieldFormsPanel({ eventId }: { eventId: Id<"events"> }) {
  const { forms, prepare, escalate, complete, countersign } =
    useEventFieldForms(eventId);
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  if (!forms) return null;
  const missing = FIELD_FORM_KEYS.length - forms.length;
  const late = forms.filter((f) => fieldFormLateness(f, now) === "late").length;
  return (
    <div className="mt-4" data-testid="field-forms">
      <h4 className="section-rule">
        <span>Day-of forms</span>
        <i aria-hidden="true" />
        <em>
          {forms.filter((f) => f.status === "done").length} of{" "}
          {FIELD_FORM_KEYS.length} done{late ? ` · ${late} late` : ""}
        </em>
      </h4>
      <p className="mt-1 text-sm text-ink-3">
        The people on the day fill these in on their phones. The office can name
        who does each one, but cannot sign for them.
      </p>
      {failure && (
        <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
      )}
      {missing > 0 && (
        <button
          className="btn btn-secondary btn-sm mt-2"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setFailure(null);
            try {
              await prepare();
            } catch (error) {
              setFailure(classifyCommandFailure(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "Setting up…"
            : forms.length
              ? `Set up the other ${missing} forms`
              : "Set up the day-of forms"}
        </button>
      )}
      <ul className="divide-y divide-line">
        {forms.map((form) => (
          <FieldFormCard
            key={form.id}
            form={form}
            now={now}
            onComplete={complete}
            onCountersign={countersign}
          >
            {form.status !== "done" &&
              fieldFormLateness(form, now) === "late" && (
                <ChaseForm form={form} onEscalate={escalate} />
              )}
          </FieldFormCard>
        ))}
      </ul>
    </div>
  );
}

function ChaseForm({
  form,
  onEscalate,
}: {
  form: FieldFormRow;
  onEscalate: (form: FieldFormRow, note: string) => Promise<unknown>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-ink-2">
        Chase it: say who you told
      </summary>
      {failure && (
        <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
      )}
      <form
        className="mt-2 space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setFailure(null);
          try {
            await onEscalate(form, note);
            setNote("");
          } catch (error) {
            setFailure(classifyCommandFailure(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          className="input block w-full"
          required
          placeholder="Called Lena, she is doing it now"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="btn btn-secondary btn-sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </details>
  );
}
