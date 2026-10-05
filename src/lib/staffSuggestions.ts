/**
 * Who can take this work (spec §12.2, AC-505/506/515): every active person is
 * either suggested (best first) or left out with one plain reason. The same
 * rules feed the manager's suggestion list and the server auto-fill, which
 * only ever picks a suggested person.
 */
import { qualificationMeets } from "./staffingTemplates";

export type SuggestionWork = {
  role: string;
  startsAt: number | null;
  endsAt: number | null;
  qualificationName?: string | null;
  certificationType?: string | null;
  /** Venue name and/or the need's work area; matched against approved places. */
  places: string[];
  /** The shift or need itself, so it is not counted as a clash. */
  ownShiftIds?: string[];
};

export type SuggestionPerson = {
  _id: string;
  givenName: string;
  familyName: string;
  status: string;
  deletedAt?: number | null;
  preferredRoles?: string[] | null;
  approvedWorkLocations?: string[] | null;
  schedulingHoldReason?: string | null;
  staffingVendor?: string | null;
};

type Window = { startsAt?: number | null; endsAt?: number | null };
export type SuggestionFacts = {
  shifts: Array<
    Window & {
      _id: string;
      personId: string;
      status: string;
      deletedAt?: number | null;
    }
  >;
  timeOff: Array<
    Window & { personId: string; status: string; deletedAt?: number | null }
  >;
  qualifications: Array<{
    personId: string;
    name: string;
    certificationType?: string | null;
    status: string;
    deletedAt?: number | null;
    expiresAt?: number | null;
  }>;
};

export type StaffSuggestion = {
  personId: string;
  name: string;
  prefersRole: boolean;
  agency: string | null;
  hoursBooked: number;
};
export type StaffExclusion = { personId: string; name: string; reason: string };

const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();
const overlaps = (a: Window, b: Window) =>
  a.startsAt != null &&
  a.endsAt != null &&
  b.startsAt != null &&
  b.endsAt != null &&
  a.startsAt < b.endsAt &&
  b.startsAt < a.endsAt;

export function suggestStaff(
  work: SuggestionWork,
  people: readonly SuggestionPerson[],
  facts: SuggestionFacts,
  now: number,
): { suggested: StaffSuggestion[]; excluded: StaffExclusion[] } {
  const suggested: StaffSuggestion[] = [];
  const excluded: StaffExclusion[] = [];
  const own = new Set(work.ownShiftIds ?? []);
  for (const person of people) {
    if (person.deletedAt != null) continue;
    const name = `${person.givenName} ${person.familyName}`.trim();
    const liveShifts = facts.shifts.filter(
      (row) =>
        row.personId === person._id &&
        row.deletedAt == null &&
        !own.has(row._id) &&
        ["scheduled", "started"].includes(row.status),
    );
    const reason = ((): string | null => {
      if (person.status !== "active") return "Paused - not taking work";
      if (person.schedulingHoldReason?.trim())
        return `Do not schedule: ${person.schedulingHoldReason.trim()}`;
      if (
        facts.timeOff.some(
          (row) =>
            row.personId === person._id &&
            row.deletedAt == null &&
            row.status === "approved" &&
            overlaps(row, work),
        )
      )
        return "Approved time off at this time";
      if (liveShifts.some((row) => overlaps(row, work)))
        return "Already working at this time";
      const cert = work.qualificationName?.trim();
      if (
        cert &&
        !facts.qualifications.some(
          (row) =>
            row.personId === person._id &&
            qualificationMeets(
              row,
              { name: cert, certificationType: work.certificationType },
              work.endsAt,
              now,
            ),
        )
      )
        return `No current ${cert} certificate`;
      const approved = (person.approvedWorkLocations ?? []).filter((row) =>
        row.trim(),
      );
      if (
        approved.length > 0 &&
        work.places.length > 0 &&
        !work.places.some((place) => approved.some((row) => same(row, place)))
      )
        return `Not approved to work at ${work.places[0]}`;
      return null;
    })();
    if (reason) {
      excluded.push({ personId: person._id, name, reason });
      continue;
    }
    const hoursBooked =
      liveShifts.reduce(
        (sum, row) =>
          sum +
          (row.startsAt != null && row.endsAt != null
            ? row.endsAt - row.startsAt
            : 0),
        0,
      ) / 3_600_000;
    suggested.push({
      personId: person._id,
      name,
      prefersRole: (person.preferredRoles ?? []).some((row) =>
        same(row, work.role),
      ),
      agency: person.staffingVendor?.trim() || null,
      hoursBooked,
    });
  }
  suggested.sort(
    (a, b) =>
      Number(b.prefersRole) - Number(a.prefersRole) ||
      Number(a.agency != null) - Number(b.agency != null) ||
      a.hoursBooked - b.hoursBooked ||
      a.name.localeCompare(b.name),
  );
  excluded.sort((a, b) => a.name.localeCompare(b.name));
  return { suggested, excluded };
}
