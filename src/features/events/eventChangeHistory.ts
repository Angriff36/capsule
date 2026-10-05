import { formatDate, formatTime } from "../../lib/format";
import type { RecordHistory } from "../../lib/useRecordHistory";

export type HistoryChange = RecordHistory["changes"][number];
export type HistoryFollowUp = RecordHistory["followUps"][number];

/** What each automatic follow-up on an event looks after. */
export const FOLLOW_UP_LABEL: Record<string, string> = {
  cancellation: "Cancellation clean-up",
  closeout: "Closeout",
  demand: "Ingredient amounts",
  invoice: "Invoice",
  menu: "Menu",
  pack: "Pack list",
  packet: "Event packet",
  prep: "Prep tasks",
  proposal: "Proposal",
  recipe: "Recipes",
  rental: "Rentals",
  staffing: "Staffing",
  style: "Service style",
  venue: "Venue",
};

/** "EventHeadcountChanged" -> "Event headcount changed". */
export function changeLabel(type: string): string {
  const words = type
    .replace(/[_.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function whenLine(at: number | null): string {
  return at == null ? "Time not saved" : `${formatDate(at)}, ${formatTime(at)}`;
}

export function whoLine(change: HistoryChange): string {
  if (change.historyMissing) return "Who did it was not saved";
  if (change.bySystem) return "Capsule, on its own";
  const role = change.byRole ? ` (${change.byRole.replace(/_/g, " ")})` : "";
  return `${change.byName ?? "A team member"}${role}`;
}

/** Counts in plain words; empty parts are left out. */
export function followUpCounts(followUp: HistoryFollowUp): string {
  const parts = [
    followUp.created > 0 ? `made ${followUp.created}` : null,
    followUp.updated > 0 ? `changed ${followUp.updated}` : null,
    followUp.retired > 0 ? `removed ${followUp.retired}` : null,
    followUp.keptAsIs > 0
      ? `kept ${followUp.keptAsIs} as people left them`
      : null,
  ].filter((part): part is string => part != null);
  if (parts.length === 0) return "Nothing needed to change.";
  const line = parts.join(", ");
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}

/** The change a follow-up ran for, and the record version it used. */
export function ranForLine(
  followUp: HistoryFollowUp,
  changes: readonly HistoryChange[],
): string {
  const trigger = changes.find(
    (change) => change.eventId === followUp.ranForEventId,
  );
  const version =
    trigger?.versionAfter != null
      ? ` It used the event at version ${trigger.versionAfter}.`
      : "";
  return `Ran after: ${changeLabel(followUp.ranFor)}.${version}`;
}

/** A follow-up is out of date when the event changed after it last ran. */
export function followUpOutOfDate(
  followUp: HistoryFollowUp,
  changes: readonly HistoryChange[],
): boolean {
  const latest = changes[0];
  if (!latest || followUp.at == null) return false;
  return latest.eventId !== followUp.ranForEventId && latest.at > followUp.at;
}

export function waitingLine(item: HistoryFollowUp["waiting"][number]): string {
  const things = item.records === 1 ? "1 item" : `${item.records} items`;
  return `${changeLabel(item.code)}: ${things} wait for ${item.whoCanAct.toLowerCase()}.`;
}
