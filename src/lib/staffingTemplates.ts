/**
 * Crew templates (spec §12.2, AC-495/503/504): pure rules shared by the
 * server (convex/lib/shiftSchedulingEvents.ts ensureTemplateStaffNeeds) and
 * the crew template screen. A template line says which role, how many people
 * (fixed, per guests, or both with a minimum) and what the work needs.
 */

export type StaffPayBasis = "hourly" | "flat_rate";

export type StaffingTemplateLine = {
  role: string;
  fixedCount?: number;
  guestsPerWorker?: number;
  minCount?: number;
  qualificationName?: string;
  certificationType?: string;
  skills?: string;
  uniform?: string;
  workLocation?: string;
  payBasis?: StaffPayBasis;
  budgetHourlyRate?: number;
};

export type StaffingTemplateCandidate = {
  _id: string;
  name: string;
  serviceStyleId?: string | null;
  minGuests?: number | null;
  maxGuests?: number | null;
  lines: string;
  status: string;
  deletedAt?: number | null;
};

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
const whole = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;

/**
 * A qualification meets a certificate requirement when the name matches
 * (trimmed, any case), the type matches when one is required, it is active
 * and it lasts through the end of the work (unknown end = valid today).
 */
export function qualificationMeets(
  row: {
    name: string;
    certificationType?: string | null;
    status: string;
    deletedAt?: number | null;
    expiresAt?: number | null;
  },
  requirement: { name: string; certificationType?: string | null },
  workEndsAt: number | null,
  now: number,
): boolean {
  const same = (a?: string | null, b?: string | null) =>
    (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
  return (
    row.deletedAt == null &&
    row.status === "active" &&
    same(row.name, requirement.name) &&
    (!requirement.certificationType?.trim() ||
      same(row.certificationType, requirement.certificationType)) &&
    (row.expiresAt == null || row.expiresAt >= (workEndsAt ?? now))
  );
}

/** Parse stored lines; a line without a role is dropped, never guessed. */
export function parseTemplateLines(json: string): StaffingTemplateLine[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): StaffingTemplateLine[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const role = text(row.role);
    if (!role) return [];
    const payBasis =
      row.payBasis === "hourly" || row.payBasis === "flat_rate"
        ? row.payBasis
        : undefined;
    const rate =
      typeof row.budgetHourlyRate === "number" &&
      Number.isFinite(row.budgetHourlyRate) &&
      row.budgetHourlyRate >= 0
        ? row.budgetHourlyRate
        : undefined;
    const perGuests = whole(row.guestsPerWorker);
    return [
      {
        role,
        fixedCount: whole(row.fixedCount),
        guestsPerWorker: perGuests && perGuests > 0 ? perGuests : undefined,
        minCount: whole(row.minCount),
        qualificationName: text(row.qualificationName),
        certificationType: text(row.certificationType),
        skills: text(row.skills),
        uniform: text(row.uniform),
        workLocation: text(row.workLocation),
        payBasis,
        budgetHourlyRate: rate,
      },
    ];
  });
}

/** People a line needs for this guest count (unknown guests = fixed part only). */
export function templateLineCount(
  line: StaffingTemplateLine,
  guests: number | null | undefined,
): number {
  const perGuest =
    line.guestsPerWorker && guests != null && guests > 0
      ? Math.ceil(guests / line.guestsPerWorker)
      : 0;
  return Math.max((line.fixedCount ?? 0) + perGuest, line.minCount ?? 0);
}

/** Stable key for one line inside a template (role + position). */
export function templateLineKey(line: StaffingTemplateLine, index: number) {
  return `${index}:${line.role.toLowerCase()}`;
}

/**
 * The active template for this event: a template for the event's service
 * style beats one for any style; inside that, the narrowest guest range wins;
 * ties go to the name. None fits = null (approval adds no staff).
 */
export function pickStaffingTemplate<T extends StaffingTemplateCandidate>(
  templates: readonly T[],
  event: { serviceStyleId?: string | null; guests?: number | null },
): T | null {
  const guests = event.guests ?? null;
  const fits = templates.filter(
    (row) =>
      row.status === "active" &&
      row.deletedAt == null &&
      (row.serviceStyleId == null ||
        row.serviceStyleId === event.serviceStyleId) &&
      (row.minGuests == null || (guests != null && guests >= row.minGuests)) &&
      (row.maxGuests == null || (guests != null && guests <= row.maxGuests)),
  );
  const width = (row: T) =>
    (row.maxGuests ?? Number.MAX_SAFE_INTEGER) - (row.minGuests ?? 0);
  return (
    [...fits].sort(
      (a, b) =>
        Number(b.serviceStyleId != null) - Number(a.serviceStyleId != null) ||
        width(a) - width(b) ||
        a.name.localeCompare(b.name),
    )[0] ?? null
  );
}
