import type { EventBundle } from "../lib/tppReports/eventBundle";
import type { CapsuleEventBundleContext } from "./CapsuleEventBundleExistingState";
import { normalizeName, type PlannedStep } from "./CapsuleEventBundleShared";

/**
 * Staff named on the battle board become event assignments, matched by name
 * against the tenant's people. Pure: decides calls, makes none.
 */
export function planStaffSteps(input: {
  bundle: EventBundle;
  invoice: string;
  startsAt: number;
  endsAt: number;
  context: CapsuleEventBundleContext;
}): { steps: PlannedStep[]; warnings: string[]; count: number } {
  const { bundle, invoice, context } = input;
  const steps: PlannedStep[] = [];
  const warnings: string[] = [];
  let count = 0;
  if (bundle.staff.length === 0) return { steps, warnings, count };

  const people = context.directory?.people;
  if (!people) {
    warnings.push(
      `${bundle.staff.length} staff assignment(s) were read but not entered: the run had no people directory to match names against.`,
    );
    return { steps, warnings, count };
  }

  const assigned = new Set(context.existing?.assignedPersonIds ?? []);
  const byName = new Map(
    people.map((person) => [normalizeName(person.name), person.id]),
  );
  const missing: string[] = [];
  for (const member of bundle.staff) {
    const personId = byName.get(normalizeName(member.name));
    if (personId === undefined) {
      missing.push(member.name);
      continue;
    }
    if (assigned.has(personId)) continue;
    assigned.add(personId);
    count += 1;
    steps.push({
      capabilityId: "EventAssignment.assign",
      ref: `assignment:${personId}`,
      label: `Assign ${member.name}`,
      idempotencySuffix: `assign:${invoice}:${normalizeName(member.name)}`,
      resolveRefs: ["eventId"],
      args: {
        eventId: "event",
        personId,
        role:
          [member.role ?? member.team, member.station]
            .filter(Boolean)
            .join(" - ") || "Event staff",
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      },
    });
  }
  if (missing.length > 0) {
    warnings.push(
      `${missing.length} staff name(s) on the battle board match no person record: ${missing.join(", ")}. Add them under Staff, then re-run.`,
    );
  }
  return { steps, warnings, count };
}
