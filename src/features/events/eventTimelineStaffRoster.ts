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
  readonly source: "assignment" | "filled_need";
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
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
        startsAt: row.startsAt,
        unassign:
          row._id != null && version != null
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
      if (seenRole.has(dupeKey)) continue;
      seenRole.add(dupeKey);
      entries.push({
        key: need._id ? `need:${need._id}` : dupeKey,
        personId,
        label: EventTimelineStaffRoster.labelFor(person),
        role,
        status: "filled",
        source: "filled_need",
        startsAt: need.startsAt ?? need.due ?? null,
      });
    }

    return entries;
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
