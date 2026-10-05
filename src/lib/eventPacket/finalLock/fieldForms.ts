import { QUESTIONS } from "./policy";
import { dayTimes } from "./timelineSetup";
import type { FinalLockInput } from "./types";

/**
 * The ten day-of forms (spec §14.2 "Questions Capsule must not auto-answer").
 * The office prepares each one - who, when, what to check, what proof to
 * leave - and a person fills it in on the day. Nothing here marks one done.
 */
export type FieldEvidence = "none" | "note" | "photo";

interface FormSetup {
  /** Day-plan time it is due at (see dayTimes). */
  dueAt: string;
  /** Who does it by default: the truck driver or the event lead. */
  owner: "driver" | "lead";
  twoPeople?: boolean;
  evidence: FieldEvidence;
  instructions: string;
  /** Which planned items the form lists for checking. */
  items?: "pack" | "equipment";
}

export const FIELD_FORMS: Record<string, FormSetup> = {
  "field.packing": {
    dueAt: "shop_departure",
    owner: "driver",
    evidence: "none",
    instructions: "Tick off every pack list line as it goes into the bins.",
    items: "pack",
  },
  "field.bins": {
    dueAt: "shop_departure",
    owner: "driver",
    evidence: "none",
    instructions: "Label every bin with the event and what is inside.",
    items: "pack",
  },
  "field.leaving-shop": {
    dueAt: "shop_departure",
    owner: "driver",
    evidence: "none",
    instructions:
      "Before the truck leaves: everything on the pack list is on board, hot and cold food is held right, and the event folder is in the truck.",
    items: "pack",
  },
  "field.takeoff-readiness": {
    dueAt: "shop_departure",
    owner: "driver",
    twoPeople: true,
    evidence: "none",
    instructions:
      "Two people walk the load together: every line on the truck, straps on, doors locked. Each signs for themselves.",
    items: "pack",
  },
  "field.arrival": {
    dueAt: "onsite_arrival",
    owner: "lead",
    evidence: "none",
    instructions:
      "On arrival: meet the contact, check the room against the setup plan, and write down anything that is different.",
  },
  "field.buffet-drawing": {
    dueAt: "service",
    owner: "lead",
    evidence: "photo",
    instructions: "Take a photo (or a drawing) of the buffet as it is set.",
  },
  "field.muda": {
    dueAt: "venue_departure",
    owner: "lead",
    evidence: "note",
    instructions: "Count the food left over and the food thrown away.",
  },
  "field.after-event": {
    dueAt: "venue_departure",
    owner: "lead",
    evidence: "none",
    instructions:
      "Walk the room: nothing left behind, the room is as we found it.",
  },
  "field.leaving-event": {
    dueAt: "venue_departure",
    owner: "lead",
    evidence: "none",
    instructions:
      "Last check before leaving the venue: all equipment and bins are on the truck.",
    items: "equipment",
  },
  "field.return": {
    dueAt: "staff_off",
    owner: "driver",
    evidence: "none",
    instructions:
      "Back at the shop: unload, put equipment away, and report anything broken or missing.",
    items: "equipment",
  },
};

export const FIELD_FORM_KEYS = Object.keys(FIELD_FORMS);

/** When a form is due, from the day plan (null when the plan has no time). */
export function fieldFormDueAt(input: FinalLockInput, formKey: string) {
  const setup = FIELD_FORMS[formKey];
  return setup ? (dayTimes(input).times[setup.dueAt] ?? null) : null;
}

export interface CrewMember {
  personId: string;
  role: string;
}

export interface PlannedFieldForm {
  formKey: string;
  label: string;
  needsTwoPeople: boolean;
  evidence: FieldEvidence;
  dueAt: number | null;
  responsiblePersonId: string | null;
  secondPersonId: string | null;
  instructions: string;
  expectedItems: string | null;
}

const LEAD = /lead|captain|manager|supervisor/i;
const MAX_ITEMS = 40;

function listItems(names: string[]) {
  if (!names.length) return null;
  const shown = names.slice(0, MAX_ITEMS).join("; ");
  return names.length > MAX_ITEMS
    ? `${shown}; and ${names.length - MAX_ITEMS} more`
    : shown;
}

/**
 * The forms an event still needs. Names are filled only when the crew makes
 * them clear (one lead, a driver on a truck); otherwise the office picks.
 */
export function planFieldForms(
  input: FinalLockInput,
  crew: CrewMember[],
  driverIds: string[],
  existing: ReadonlySet<string>,
): PlannedFieldForm[] {
  const leads = [
    ...new Set(crew.filter((c) => LEAD.test(c.role)).map((c) => c.personId)),
  ];
  const lead = leads.length === 1 ? leads[0]! : null;
  const drivers = [...new Set(driverIds)];
  const driver = drivers.length === 1 ? drivers[0]! : null;
  const pack = listItems(input.packItems.map((i) => i.description));
  const equipment = listItems(
    input.equipment.map((e) => `${e.name} x ${e.quantity}`),
  );
  return QUESTIONS.filter((q) => q.form && !existing.has(q.form)).map((q) => {
    const form = q.form!;
    const setup = FIELD_FORMS[form]!;
    const first = setup.owner === "driver" ? (driver ?? lead) : lead;
    const second = setup.twoPeople
      ? ([lead, driver].find((p) => p && p !== first) ?? null)
      : null;
    return {
      formKey: form,
      label: q.label,
      needsTwoPeople: !!setup.twoPeople,
      evidence: setup.evidence,
      dueAt: fieldFormDueAt(input, form),
      responsiblePersonId: first,
      secondPersonId: second,
      instructions: setup.instructions,
      expectedItems:
        setup.items === "pack"
          ? pack
          : setup.items === "equipment"
            ? equipment
            : null,
    };
  });
}

export type FieldFormStatus = "open" | "first_signed" | "done";

/** Late or not, worked out from the due time each time it is shown. */
export function fieldFormLateness(
  form: { status: FieldFormStatus; dueAt: number | null },
  now: number,
): "done" | "late" | "due_soon" | "waiting" {
  if (form.status === "done") return "done";
  if (form.dueAt == null) return "waiting";
  if (now > form.dueAt) return "late";
  return form.dueAt - now <= 60 * 60_000 ? "due_soon" : "waiting";
}
