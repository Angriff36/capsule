export type TimelineStaffOption = {
  readonly personId: string;
  readonly label: string;
};

type AssignmentRow = {
  readonly _id?: string;
  readonly deletedAt?: number | null;
  readonly eventId?: string | null;
  readonly personId?: string | null;
  readonly role?: string | null;
  readonly status?: string | null;
  readonly version?: number;
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
};

type ShiftRow = AssignmentRow & {
  readonly _id: string;
  readonly eventStaffingSourceIds?: readonly string[] | null;
};

export type StaffNeedRow = {
  readonly _id?: string;
  readonly deletedAt?: number | null;
  readonly eventId?: string | null;
  readonly role?: string | null;
  readonly status?: string | null;
  readonly filledByPersonId?: string | null;
  readonly claimedByPersonId?: string | null;
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
  readonly due?: number | null;
};

export type PersonRow = {
  readonly _id: string;
  readonly deletedAt?: number | null;
  readonly givenName?: string | null;
  readonly familyName?: string | null;
};

export type StaffingRosterEntry = {
  readonly key: string;
  readonly personId: string;
  readonly label: string;
  readonly role: string;
  readonly status: string;
  readonly source: "assignment" | "filled_need" | "shift";
  readonly sourceIds?: readonly string[];
  readonly plannedWindows?: readonly {
    startsAt?: number | null;
    endsAt?: number | null;
  }[];
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
  readonly shiftWindows?: readonly {
    startsAt?: number | null;
    endsAt?: number | null;
  }[];
  readonly unassign?: {
    readonly docId: string;
    readonly version: number;
  };
};

function peopleById(
  people: readonly PersonRow[] | undefined,
): Map<string, PersonRow> {
  return new Map(
    (people ?? [])
      .filter((person) => person.deletedAt == null)
      .map((person) => [person._id, person] as const),
  );
}

/** People currently staffed on an event (Staffing tab roster). */
export class EventTimelineStaffRoster {
  static fromAssignments(input: {
    readonly eventId: string;
    readonly assignments: readonly AssignmentRow[] | undefined;
    readonly people: readonly PersonRow[] | undefined;
    readonly staffNeeds?: readonly StaffNeedRow[] | undefined;
    readonly shifts?: readonly ShiftRow[] | undefined;
  }): TimelineStaffOption[] {
    const seen = new Set<string>();
    const options: TimelineStaffOption[] = [];
    for (const entry of EventTimelineStaffRoster.staffingRosterEntries(input)) {
      if (seen.has(entry.personId)) continue;
      seen.add(entry.personId);
      options.push({ personId: entry.personId, label: entry.label });
    }

    return options.sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" }),
    );
  }

  /**
   * Assigned-staff list for the event Staffing tab: manual assignments plus
   * people who covered a posted open shift via fill.
   */
  static staffingRosterEntries(input: {
    readonly eventId: string;
    readonly assignments: readonly AssignmentRow[] | undefined;
    readonly people: readonly PersonRow[] | undefined;
    readonly staffNeeds?: readonly StaffNeedRow[] | undefined;
    readonly shifts?: readonly ShiftRow[] | undefined;
  }): StaffingRosterEntry[] {
    const directory = peopleById(input.people);
    const entries: StaffingRosterEntry[] = [];
    const seenRole = new Set<string>();

    for (const row of input.assignments ?? []) {
      if (row.deletedAt != null) continue;
      if (row.eventId !== input.eventId) continue;
      if (row.status === "unassigned") continue;
      const personId = row.personId;
      if (!personId) continue;
      const person = directory.get(personId);
      if (person == null) continue;
      const role = (row.role ?? "").trim();
      const dupeKey = `${personId}::${role}`;
      seenRole.add(dupeKey);
      const version = row.version;
      entries.push({
        key: row._id ?? dupeKey,
        personId,
        label: EventTimelineStaffRoster.labelFor(person),
        role,
        status: String(row.status ?? "assigned"),
        source: "assignment",
        sourceIds: row._id ? [row._id] : [],
        plannedWindows: [{ startsAt: row.startsAt, endsAt: row.endsAt }],
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        unassign:
          row._id != null &&
          version != null &&
          (row.status === "assigned" || row.status === "confirmed")
            ? { docId: row._id, version }
            : undefined,
      });
    }

    for (const need of input.staffNeeds ?? []) {
      if (need.deletedAt != null) continue;
      if (need.eventId !== input.eventId) continue;
      if (need.status !== "filled") continue;
      const personId = need.filledByPersonId;
      if (!personId) continue;
      const person = directory.get(personId);
      if (person == null) continue;
      const role = (need.role ?? "").trim();
      const dupeKey = `${personId}::${role}`;
      if (seenRole.has(dupeKey)) {
        const index = entries.findIndex(
          (entry) => entry.personId === personId && entry.role === role,
        );
        if (index >= 0) {
          const entry = entries[index];
          entries[index] = {
            ...entry,
            sourceIds: [
              ...(entry.sourceIds ?? []),
              ...(need._id ? [need._id] : []),
            ],
            plannedWindows: [
              ...(entry.plannedWindows ?? []),
              { startsAt: need.startsAt ?? need.due, endsAt: need.endsAt },
            ],
          };
        }
        continue;
      }
      seenRole.add(dupeKey);
      entries.push({
        key: need._id ? `need:${need._id}` : dupeKey,
        personId,
        label: EventTimelineStaffRoster.labelFor(person),
        role,
        status: "filled",
        source: "filled_need",
        sourceIds: need._id ? [need._id] : [],
        plannedWindows: [
          { startsAt: need.startsAt ?? need.due, endsAt: need.endsAt },
        ],
        startsAt: need.startsAt ?? need.due ?? null,
        endsAt: need.endsAt,
      });
    }

    if (input.shifts === undefined) return entries;
    const shifts = input.shifts.filter(
      (shift) =>
        shift.deletedAt == null &&
        shift.eventId === input.eventId &&
        shift.status !== "cancelled",
    );
    const represented = new Set<string>();
    const scheduledEntries = entries.map((entry) => {
      const windows = shifts
        .filter(
          (shift) =>
            shift.personId === entry.personId &&
            shift.eventStaffingSourceIds?.some((id) =>
              entry.sourceIds?.includes(id),
            ),
        )
        .sort(
          (left, right) =>
            Number(left.startsAt ?? 0) - Number(right.startsAt ?? 0),
        );
      for (const shift of windows) represented.add(shift._id);
      return {
        ...entry,
        shiftWindows: windows,
        startsAt: windows.length ? windows[0].startsAt : entry.startsAt,
        endsAt: windows.length
          ? windows[windows.length - 1].endsAt
          : entry.endsAt,
      };
    });
    // Manual-only and historical shifts are real work in their own right.
    // They never supply an unrelated Assignment's role or window.
    for (const shift of shifts) {
      if (represented.has(shift._id) || !shift.personId) continue;
      const person = directory.get(shift.personId);
      if (!person) continue;
      scheduledEntries.push({
        key: `shift:${shift._id}`,
        personId: shift.personId,
        label: EventTimelineStaffRoster.labelFor(person),
        role: shift.role?.trim() || "Shift",
        status: String(shift.status ?? "scheduled"),
        source: "shift",
        sourceIds: [],
        plannedWindows: [],
        shiftWindows: [shift],
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
      });
    }
    return scheduledEntries;
  }

  static labelFor(person: PersonRow): string {
    return (
      [person.givenName, person.familyName].filter(Boolean).join(" ") || "Staff"
    );
  }

  static personIdForNeed(need: StaffNeedRow): string | null {
    if (need.status === "filled") {
      return need.filledByPersonId ?? null;
    }
    if (need.status === "claimed") {
      return need.claimedByPersonId ?? need.filledByPersonId ?? null;
    }
    return null;
  }

  /** Open-shift row title. Filled (and claimed) rows name who is covering. */
  static titleForNeed(
    need: StaffNeedRow,
    person: PersonRow | null | undefined,
  ): string {
    const role = (need.role ?? "").trim() || "Open shift";
    if (need.status !== "filled" && need.status !== "claimed") {
      return role;
    }
    if (person == null) return role;
    return `${role} — ${EventTimelineStaffRoster.labelFor(person)}`;
  }
}
