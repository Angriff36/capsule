export type TimelineStaffOption = {
  readonly personId: string;
  readonly label: string;
};

type AssignmentRow = {
  readonly deletedAt?: number | null;
  readonly eventId?: string | null;
  readonly personId?: string | null;
  readonly status?: string | null;
};

type PersonRow = {
  readonly _id: string;
  readonly deletedAt?: number | null;
  readonly givenName?: string | null;
  readonly familyName?: string | null;
};

/** People currently staffed on an event (Staffing tab roster). */
export class EventTimelineStaffRoster {
  static fromAssignments(input: {
    readonly eventId: string;
    readonly assignments: readonly AssignmentRow[] | undefined;
    readonly people: readonly PersonRow[] | undefined;
  }): TimelineStaffOption[] {
    const peopleById = new Map(
      (input.people ?? [])
        .filter((person) => person.deletedAt == null)
        .map((person) => [person._id, person] as const),
    );
    const seen = new Set<string>();
    const options: TimelineStaffOption[] = [];

    for (const row of input.assignments ?? []) {
      if (row.deletedAt != null) continue;
      if (row.eventId !== input.eventId) continue;
      if (row.status === "unassigned") continue;
      const personId = row.personId;
      if (!personId || seen.has(personId)) continue;
      const person = peopleById.get(personId);
      if (person == null) continue;
      seen.add(personId);
      options.push({
        personId,
        label: EventTimelineStaffRoster.labelFor(person),
      });
    }

    return options.sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" }),
    );
  }

  static labelFor(person: PersonRow): string {
    return (
      [person.givenName, person.familyName].filter(Boolean).join(" ") || "Staff"
    );
  }
}
