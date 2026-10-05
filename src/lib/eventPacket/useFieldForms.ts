import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "../api";
import {
  useFieldConfirmationComplete,
  useFieldConfirmationCountersign,
  useFieldConfirmationEscalate,
} from "../manifest-convex-react";
import type { FieldFormRow } from "../../../convex/lib/eventPacket/finalLock";

export type { FieldFormRow };
export type MyFieldFormRow = FieldFormRow & { eventTitle: string };

export interface CompleteFieldForm {
  outcome: "all_good" | "problem";
  observedAt?: number;
  note?: string;
  /** An uploaded photo (see FieldFormCard's sign form). */
  photoStorageId?: string;
  /** The filled-in paper form (fieldFormAnswers.encodeAnswers). */
  answers?: string;
}

/** Sign-offs on day-of forms: the first person and the second person. */
function useFieldFormActions() {
  const complete = useFieldConfirmationComplete();
  const countersign = useFieldConfirmationCountersign();
  return {
    complete: (form: FieldFormRow, input: CompleteFieldForm) =>
      complete({
        docId: form.id,
        version: form.version ?? undefined,
        outcome: input.outcome,
        observedAt: input.observedAt,
        note: input.note?.trim() || undefined,
        photoStorageId: input.photoStorageId,
        answers: input.answers,
      }),
    countersign: (form: FieldFormRow, note?: string, observedAt?: number) =>
      countersign({
        docId: form.id,
        version: form.version ?? undefined,
        note: note?.trim() || undefined,
        observedAt,
      }),
  };
}

/** The signed-in person's day-of forms, and signing them. */
export function useMyFieldForms() {
  const forms = useQuery(api.lib.eventPacket.finalLock.myFieldForms, {}) as
    MyFieldFormRow[] | undefined;
  return { forms, ...useFieldFormActions() };
}

/** One event's day-of forms, setting them up, and chasing a late one. */
export function useEventFieldForms(eventId: Id<"events">) {
  const finalLock = api.lib.eventPacket.finalLock;
  const forms = useQuery(finalLock.listEventFieldForms, { eventId }) as
    FieldFormRow[] | undefined;
  const prepare = useMutation(finalLock.prepareFieldForms);
  const escalate = useFieldConfirmationEscalate();
  return {
    forms,
    ...useFieldFormActions(),
    prepare: () => prepare({ eventId }),
    escalate: (form: FieldFormRow, note: string) =>
      escalate({ docId: form.id, version: form.version ?? undefined, note }),
  };
}
