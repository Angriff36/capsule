import { eventMenuHeadcountHint } from "../lib/eventMenuHeadcountHint";
import type { EventBundle } from "../lib/tppReports/eventBundle";
import {
  dishKey,
  isMenuDishLine,
  normalizeName,
  type PlannedStep,
} from "./CapsuleEventBundleShared";

/**
 * Turns what the reports could not settle into ReviewFlags on the new event,
 * so the Ops Final Lock walk-through opens with the anomalies already listed
 * instead of buried in a chat thread. Pure: decides calls, makes none.
 *
 * Two sources: merge warnings that record a disagreement between reports
 * ("Servings differ for X (beo=30, eventWorksheet=72)"), and menu lines
 * whose servings are out of step with the guest count.
 */

/** Warnings that describe the event's data, not the run's mechanics. */
const DATA_ANOMALY =
  /servings differ|different invoice numbers|no start time|was skipped|were skipped|not entered|match no person/i;

export function planReviewFlagSteps(input: {
  bundle: EventBundle;
  invoice: string;
  warnings: readonly string[];
  /** dishKey(menu item name) → the EventDish step ref or seeded id ref. */
  eventDishRefs: ReadonlyMap<string, string>;
}): { steps: PlannedStep[]; count: number } {
  const { bundle, invoice, warnings, eventDishRefs } = input;
  const steps: PlannedStep[] = [];
  const seen = new Set<string>();

  const headcount = bundle.header.guestCount ?? 0;
  bundle.menu.forEach((item) => {
    if (!isMenuDishLine(item) || item.quantityServings === undefined) return;
    const key = dishKey(item.name);
    const eventDishRef = eventDishRefs.get(key);
    if (eventDishRef === undefined) return;
    const hint = eventMenuHeadcountHint({
      dishName: item.name,
      quantityServings: item.quantityServings,
      expectedHeadcount: headcount,
    });
    if (hint === null || seen.has(`line:${key}`)) return;
    seen.add(`line:${key}`);
    steps.push({
      capabilityId: "ReviewFlag.raise",
      ref: `flag:line:${key}`,
      label: `Flag ${item.name} for review (${hint.text})`,
      idempotencySuffix: `flag:${invoice}:line:${key}`,
      resolveRefs: ["eventId", "targetId"],
      args: {
        eventId: "event",
        targetKind: "menu_line",
        targetId: eventDishRef,
        targetLabel: item.name,
        question: hint.question,
      },
    });
  });

  warnings.forEach((warning) => {
    if (!DATA_ANOMALY.test(warning)) return;
    const key = normalizeName(warning).slice(0, 80);
    if (seen.has(`event:${key}`)) return;
    seen.add(`event:${key}`);
    steps.push({
      capabilityId: "ReviewFlag.raise",
      ref: `flag:event:${steps.length}`,
      label: `Flag for review: ${warning.slice(0, 60)}${warning.length > 60 ? "…" : ""}`,
      idempotencySuffix: `flag:${invoice}:event:${key}`,
      resolveRefs: ["eventId"],
      args: {
        eventId: "event",
        targetKind: "whole_event",
        targetLabel: "Imported from TPP reports",
        question: warning,
      },
    });
  });

  return { steps, count: steps.length };
}
