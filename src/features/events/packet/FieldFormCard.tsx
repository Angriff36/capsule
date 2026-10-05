import { useState, type ReactNode } from "react";
import { fieldFormLateness } from "../../../lib/eventPacket/finalLock/fieldForms";
import {
  MUDA_FORM_KEY,
  blankChecklist,
  blankMuda,
  encodeAnswers,
  missedLines,
  mudaSummary,
} from "../../../lib/eventPacket/finalLock/fieldFormAnswers";
import {
  ChecklistInput,
  FieldFormAnswersView,
  MudaInput,
  menuNames,
} from "./FieldFormAnswerInputs";
import { useGenerateUploadUrl } from "../../../lib/fileStorageClient";
import type {
  CompleteFieldForm,
  FieldFormRow,
} from "../../../lib/eventPacket/useFieldForms";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { FailureBanner } from "../FailureBanner";

const when = (value: number | null) =>
  value == null ? null : new Date(value).toLocaleString();

/** Local "yyyy-mm-ddThh:mm" for a datetime-local box. */
const localInput = (ms: number) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

/** Who signed, who is down to do it, and whether it is late. */
export function fieldFormStatus(form: FieldFormRow, now: number) {
  if (form.status === "done")
    return `Done by ${form.completedBy ?? "a staff member"}${
      form.checkedBy ? ` and ${form.checkedBy}` : ""
    }, ${when(form.secondObservedAt ?? form.observedAt)}`;
  if (form.status === "first_signed")
    return `Signed by ${form.completedBy ?? "a staff member"}. Needs a second person to check it too.`;
  const late = fieldFormLateness(form, now);
  const due = form.dueAt ? `Due ${when(form.dueAt)}` : "Due on the day";
  return late === "late"
    ? `Late - ${due.toLowerCase()}`
    : late === "due_soon"
      ? `${due} - within the hour`
      : due;
}

/**
 * One day-of form: what to do and check, who is down to do it, and the
 * sign-off. The person signing is whoever is signed in; the office cannot
 * sign for them.
 */
export function FieldFormCard({
  form,
  now,
  heading,
  myPersonId,
  onComplete,
  onCountersign,
  children,
}: {
  form: FieldFormRow;
  now: number;
  heading?: ReactNode;
  /** The signed-in person, so the first signer is not offered the second check. */
  myPersonId?: string | null;
  onComplete?: (
    form: FieldFormRow,
    input: CompleteFieldForm,
  ) => Promise<unknown>;
  onCountersign?: (
    form: FieldFormRow,
    note?: string,
    observedAt?: number,
  ) => Promise<unknown>;
  children?: ReactNode;
}) {
  const late = fieldFormLateness(form, now) === "late";
  const planned = [form.responsible, form.needsTwoPeople ? form.second : null]
    .filter(Boolean)
    .join(" and ");
  return (
    <li className="py-3 text-sm" data-field-form={form.formKey}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-ink">{heading ?? form.label}</span>
        <span className={late ? "text-danger" : "text-ink-2"}>
          {fieldFormStatus(form, now)}
        </span>
      </div>
      <p className="mt-1 text-ink-3">
        {planned ? `Down to do it: ${planned}` : "Nobody named yet"}
        {form.needsTwoPeople ? " · two people sign" : ""}
      </p>
      {form.instructions && (
        <p className="mt-1 text-ink">{form.instructions}</p>
      )}
      {form.expectedItems && (
        <p className="mt-1 text-ink-2">
          {form.formKey === MUDA_FORM_KEY ? "Menu" : "Check"}:{" "}
          {form.expectedItems}
        </p>
      )}
      {form.outcome === "problem" && (
        <p className="mt-1 text-danger">Problem reported</p>
      )}
      <FieldFormAnswersView raw={form.answers} />
      {form.note && <p className="mt-1 text-ink-2">Note: {form.note}</p>}
      {form.secondNote && (
        <p className="mt-1 text-ink-2">Second check: {form.secondNote}</p>
      )}
      {form.photoUrl && (
        <a
          className="btn-link mt-1 inline-block"
          href={form.photoUrl}
          target="_blank"
          rel="noreferrer"
        >
          See the photo
        </a>
      )}
      {form.escalatedAt && form.status !== "done" && (
        <p className="mt-1 text-ink-2">
          Chased by {form.escalatedBy ?? "a manager"} {when(form.escalatedAt)}:{" "}
          {form.escalationNote}
        </p>
      )}
      {onComplete && form.status === "open" && (
        <SignForm form={form} onComplete={onComplete} />
      )}
      {onCountersign &&
        form.status === "first_signed" &&
        form.completedById !== myPersonId && (
          <CountersignForm form={form} onCountersign={onCountersign} />
        )}
      {children}
    </li>
  );
}

function SignForm({
  form,
  onComplete,
}: {
  form: FieldFormRow;
  onComplete: (
    form: FieldFormRow,
    input: CompleteFieldForm,
  ) => Promise<unknown>;
}) {
  const [outcome, setOutcome] = useState<"all_good" | "problem">("all_good");
  const [at, setAt] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [lines, setLines] = useState(() => blankChecklist(form.formKey));
  const isMuda = form.formKey === MUDA_FORM_KEY;
  const [muda, setMuda] = useState(blankMuda);
  const uploadUrl = useGenerateUploadUrl();
  const missed = missedLines(lines).length;
  // An unticked paper line is a problem to explain; the food waste form's
  // counts are its note.
  const effectiveOutcome = missed > 0 ? "problem" : outcome;
  const needsNote =
    effectiveOutcome === "problem" || (form.evidence === "note" && !isMuda);
  const upload = async (file: File) => {
    const res = await fetch(await uploadUrl(), {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) throw new Error("The photo didn't upload. Try again.");
    return ((await res.json()) as { storageId: string }).storageId;
  };
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-ink-2">
        {form.needsTwoPeople ? "Sign as the first person" : "Fill in this form"}
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
            await onComplete(form, {
              outcome: effectiveOutcome,
              observedAt: at ? new Date(at).getTime() : undefined,
              note: isMuda
                ? [mudaSummary(muda), note.trim()].filter(Boolean).join(" ")
                : note,
              photoStorageId: photo ? await upload(photo) : undefined,
              answers: isMuda
                ? encodeAnswers({ kind: "muda", muda })
                : lines.length
                  ? encodeAnswers({ kind: "checklist", lines })
                  : undefined,
            });
          } catch (error) {
            setFailure(classifyCommandFailure(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        {lines.length > 0 && (
          <ChecklistInput lines={lines} onChange={setLines} />
        )}
        {isMuda && (
          <MudaInput
            muda={muda}
            menu={menuNames(form.expectedItems)}
            onChange={setMuda}
          />
        )}
        {missed > 0 ? (
          <p className="text-danger">
            {missed} {missed === 1 ? "line is" : "lines are"} not ticked. Say
            why below; the office sees it as a problem.
          </p>
        ) : (
          <fieldset className="flex flex-wrap gap-4">
            <legend className="sr-only">How did it go</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`outcome-${form.id}`}
                checked={outcome === "all_good"}
                onChange={() => setOutcome("all_good")}
              />
              All good
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`outcome-${form.id}`}
                checked={outcome === "problem"}
                onChange={() => setOutcome("problem")}
              />
              There is a problem
            </label>
          </fieldset>
        )}
        <label className="block">
          When you did it (leave blank for now)
          <input
            className="input mt-1 block w-full"
            type="datetime-local"
            max={localInput(Date.now())}
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
        </label>
        <label className="block">
          {missed > 0
            ? "What was not done, and why"
            : needsNote
              ? "What you saw"
              : isMuda
                ? "Anything else (optional)"
                : "Note (optional)"}
          <textarea
            className="input mt-1 block w-full"
            required={needsNote}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {form.evidence === "photo" && (
          <label className="block">
            Photo
            <input
              className="mt-1 block w-full"
              type="file"
              accept="image/*"
              capture="environment"
              required
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
        <button className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "Saving…" : "Sign it"}
        </button>
      </form>
    </details>
  );
}

function CountersignForm({
  form,
  onCountersign,
}: {
  form: FieldFormRow;
  onCountersign: (
    form: FieldFormRow,
    note?: string,
    observedAt?: number,
  ) => Promise<unknown>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-ink-2">
        Check it too and sign as the second person
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
            await onCountersign(form, note);
          } catch (error) {
            setFailure(classifyCommandFailure(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          Note (optional)
          <input
            className="input mt-1 block w-full"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "Saving…" : "Sign as second person"}
        </button>
      </form>
    </details>
  );
}
