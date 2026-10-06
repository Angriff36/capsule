/**
 * Mangia's paper day-of forms (work/Ewing "EVENT FORMS ONE PRINT"): the
 * lines the event lead ticks before leaving the shop and on arrival, and the
 * "Event Food MUDA" leftover count. The filled-in answers are kept on the
 * FieldConfirmation row as JSON (`answers`), so the form reads back as it was
 * written even after these lines change.
 */

export interface ChecklistSection {
  section: string;
  lines: string[];
}

export const FIELD_FORM_CHECKLISTS: Record<string, ChecklistSection[]> = {
  "field.leaving-shop": [
    {
      section: "Paperwork",
      lines: [
        "Every item on the pack list is clearly checked off. If in doubt, physically check the item.",
        "You have the staff sheet",
        "The decor checklist is in the binder",
        "Staff name badges are in the binder",
      ],
    },
    {
      section: "Walk through",
      lines: [
        "The event pallet for this event is empty",
        "The garage event space is empty (if one is assigned)",
        "Nothing is left behind in the loading area",
        "If no one is left at the shop: warehouse and garage doors locked, lights off",
      ],
    },
    {
      section: "Team",
      lines: [
        "2 minute chat with the team: the driving plan and the arrival plan",
      ],
    },
    {
      section: "In the vehicle",
      lines: [
        "Vehicle checklist is done (trailer too)",
        "Equipment is loaded and secured",
        "All doors are shut and secure on vehicles and trailers",
        "Enough fuel for the event",
        "All items are secured and stored",
        "Navigation is set up",
      ],
    },
  ],
  "field.arrival": [
    {
      section: "Person in charge",
      lines: [
        "Found the person in charge, and any second person in charge",
        "Went over our jobs on the event task breakdown with the client or person in charge",
        "Checked the timeline with the person in charge",
        "Asked if they have any questions for us",
      ],
    },
    {
      section: "Lay of the land",
      lines: [
        "Bathroom location",
        "Water location (if any)",
        "Serving and buffet locations",
        "Walked all the way around the venue",
      ],
    },
    {
      section: "After the event",
      lines: [
        "Went over the plan for rentals at the end of the night with the person in charge",
        "Checked if leaving with equipment will disturb the event",
      ],
    },
  ],
};

export const MUDA_FORM_KEY = "field.muda";

export type LeftoverHandling = "given_to_client" | "thrown_away" | "to_kitchen";

export const LEFTOVER_HANDLING_LABEL: Record<LeftoverHandling, string> = {
  given_to_client: "Given to client",
  thrown_away: "Thrown away",
  to_kitchen: "Brought to kitchen",
};

export type AppetizerStyle = "stationary" | "passed" | "displays";

export interface ChecklistAnswer {
  section: string;
  line: string;
  done: boolean;
}

export interface LeftoverLine {
  item: string;
  /** Appetizers are counted in servings, main items weighed in pounds. */
  kind: "appetizer" | "main";
  amount: number;
}

export interface MudaAnswers {
  /** Guests the lead thinks came; blank when they do not know. */
  attendance: number | null;
  staffError: boolean;
  staffErrorNote: string;
  appetizersUsed: boolean;
  appetizerStyles: AppetizerStyle[];
  mainsHandling: LeftoverHandling | null;
  leftovers: LeftoverLine[];
}

export type FieldFormAnswers =
  | { kind: "checklist"; lines: ChecklistAnswer[] }
  | { kind: "muda"; muda: MudaAnswers };

export function checklistFor(formKey: string): ChecklistSection[] | null {
  return FIELD_FORM_CHECKLISTS[formKey] ?? null;
}

/** Every line of a form's checklist, all unticked. */
export function blankChecklist(formKey: string): ChecklistAnswer[] {
  return (checklistFor(formKey) ?? []).flatMap((s) =>
    s.lines.map((line) => ({ section: s.section, line, done: false })),
  );
}

export function blankMuda(): MudaAnswers {
  return {
    attendance: null,
    staffError: false,
    staffErrorNote: "",
    appetizersUsed: false,
    appetizerStyles: [],
    mainsHandling: null,
    leftovers: [],
  };
}

/** Lines left unticked: the form then reports a problem and asks why. */
export function missedLines(lines: ChecklistAnswer[]) {
  return lines.filter((l) => !l.done);
}

/** Only leftover lines with an item name and a count above zero are kept. */
export function keptLeftovers(muda: MudaAnswers) {
  return muda.leftovers
    .map((l) => ({ ...l, item: l.item.trim() }))
    .filter(
      (l) => l.item.length > 0 && Number.isFinite(l.amount) && l.amount > 0,
    );
}

const unit = (l: LeftoverLine) =>
  l.kind === "appetizer"
    ? `${l.amount} serving${l.amount === 1 ? "" : "s"}`
    : `${l.amount} lb`;

/** The food waste form as one plain note (the form's required note). */
export function mudaSummary(muda: MudaAnswers): string {
  const parts: string[] = [];
  parts.push(
    muda.attendance == null
      ? "Attendance not counted"
      : `About ${muda.attendance} guests came`,
  );
  parts.push(
    muda.staffError
      ? `Waste from a staff mistake${muda.staffErrorNote.trim() ? `: ${muda.staffErrorNote.trim()}` : ""}`
      : "No waste from a staff mistake",
  );
  const left = keptLeftovers(muda);
  const apps = left.filter((l) => l.kind === "appetizer");
  const mains = left.filter((l) => l.kind === "main");
  if (muda.appetizersUsed) {
    const styles = muda.appetizerStyles.length
      ? ` (${muda.appetizerStyles.join(", ")})`
      : "";
    parts.push(
      apps.length
        ? `Appetizers${styles} left: ${apps.map((l) => `${l.item} ${unit(l)}`).join(", ")}`
        : `Appetizers${styles}: none left`,
    );
  }
  if (mains.length) {
    const how = muda.mainsHandling
      ? ` - ${LEFTOVER_HANDLING_LABEL[muda.mainsHandling].toLowerCase()}`
      : "";
    parts.push(
      `Main items left${how}: ${mains.map((l) => `${l.item} ${unit(l)}`).join(", ")}`,
    );
  } else {
    parts.push("No main items left");
  }
  return `${parts.join(". ")}.`;
}

export function encodeAnswers(answers: FieldFormAnswers): string {
  if (answers.kind === "muda")
    return JSON.stringify({
      kind: "muda",
      muda: { ...answers.muda, leftovers: keptLeftovers(answers.muda) },
    });
  return JSON.stringify(answers);
}

/** Reads stored answers; anything it cannot read shows as no answers. */
export function decodeAnswers(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as FieldFormAnswers;
    if (value?.kind === "checklist" && Array.isArray(value.lines)) return value;
    if (value?.kind === "muda" && value.muda) return value;
  } catch {
    // Not JSON: written by something else; show nothing rather than guess.
  }
  return null;
}
