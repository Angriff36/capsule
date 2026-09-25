import type {
  BundleStaffAssignment,
  EventBundle,
} from "../lib/tppReports/eventBundle";
import { toEpochMillis } from "../lib/tppReports/reportValues";
import type { CapsuleEventBundleContext } from "./CapsuleEventBundleExistingState";
import { normalizeName, type PlannedStep } from "./CapsuleEventBundleShared";

/**
 * Staff named on the reports become event assignments, matched by name
 * against the tenant's people. Rows that match nobody — including TPP's
 * "*Unassigned*" role slots — become open shifts when the caller asks for
 * that, so a role with in/out times is kept without inventing a person.
 * Pure: decides calls, makes none.
 */
export function planStaffSteps(input: {
  bundle: EventBundle;
  invoice: string;
  startsAt: number;
  endsAt: number;
  context: CapsuleEventBundleContext;
}): {
  steps: PlannedStep[];
  warnings: string[];
  count: number;
  openShifts: number;
} {
  const { bundle, invoice, context } = input;
  const steps: PlannedStep[] = [];
  const warnings: string[] = [];
  let count = 0;
  let openShifts = 0;
  if (bundle.staff.length === 0) {
    return { steps, warnings, count, openShifts };
  }

  const people = context.directory?.people;
  if (people === undefined && !context.unmatchedStaffAsOpenShifts) {
    warnings.push(
      `${bundle.staff.length} staff assignment(s) were read but not entered: Capsule could not look up your staff to match the names.`,
    );
    return { steps, warnings, count, openShifts };
  }

  const assigned = new Set(context.existing?.assignedPersonIds ?? []);
  const byName = new Map(
    (people ?? []).map((person) => [normalizeName(person.name), person.id]),
  );
  const missing: string[] = [];
  bundle.staff.forEach((member, index) => {
    const isPlaceholder = /^(unassigned|tbd|open)$/i.test(member.name.trim());
    const personId = isPlaceholder
      ? undefined
      : byName.get(normalizeName(member.name));
    if (personId === undefined) {
      if (context.unmatchedStaffAsOpenShifts) {
        openShifts += 1;
        steps.push(openShiftStep(member, index, input));
      } else if (!isPlaceholder) {
        missing.push(member.name);
      }
      return;
    }
    if (assigned.has(personId)) return;
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
        role: staffRole(member),
        startsAt: shiftStart(member, input),
        endsAt: shiftEnd(member, input),
      },
    });
  });
  if (missing.length > 0) {
    warnings.push(
      `${missing.length} staff name(s) on the battle board match no person record: ${missing.join(", ")}. Add them under Staff, then re-run.`,
    );
  }
  return { steps, warnings, count, openShifts };
}

function staffRole(member: BundleStaffAssignment): string {
  return (
    [member.role ?? member.team, member.station].filter(Boolean).join(" - ") ||
    "Event staff"
  );
}

function shiftStart(
  member: BundleStaffAssignment,
  input: { bundle: EventBundle; startsAt: number },
): number {
  const date = input.bundle.header.eventDate;
  if (member.startMinutes === undefined || date === undefined) {
    return input.startsAt;
  }
  return toEpochMillis(date, member.startMinutes);
}

function shiftEnd(
  member: BundleStaffAssignment,
  input: { bundle: EventBundle; startsAt: number; endsAt: number },
): number {
  const date = input.bundle.header.eventDate;
  if (member.endMinutes === undefined || date === undefined) {
    return input.endsAt;
  }
  const start = shiftStart(member, input);
  let end = toEpochMillis(date, member.endMinutes);
  // "6:00 PM - 1:00 AM" ends the next morning.
  if (end <= start) end += 24 * 60 * 60_000;
  return end;
}

function openShiftStep(
  member: BundleStaffAssignment,
  index: number,
  input: {
    bundle: EventBundle;
    invoice: string;
    startsAt: number;
    endsAt: number;
  },
): PlannedStep {
  const role = staffRole(member);
  const namedButUnknown = !/^(unassigned|tbd|open)$/i.test(member.name.trim());
  return {
    capabilityId: "EventStaffNeed.postOpen",
    ref: `openShift:${index}`,
    label: `Post open shift: ${role}`,
    idempotencySuffix: `open-shift:${input.invoice}:${index}:${normalizeName(role)}`,
    resolveRefs: ["eventId"],
    args: {
      eventId: "event",
      role,
      startsAt: shiftStart(member, input),
      endsAt: shiftEnd(member, input),
      notes: namedButUnknown
        ? `TPP names "${member.name}" for this role, but no matching staff record was found.`
        : "Unassigned on the TPP staffing sheet.",
    },
  };
}
