/**
 * Which event-bundle plan warnings a human must accept before entering.
 * Pure and Node-free so the browser import screen and the MCP coordinator
 * split warnings the same way.
 */

/**
 * Warnings that report data left out of the event, or a value that was
 * guessed for it (an assumed start time); everything else is a note.
 */
const NEEDS_DECISION =
  /was skipped|were skipped|not entered|match no person|is assumed|different invoice numbers/;

/** The warnings a human must accept before entering; the rest are notes. */
export function warningsNeedingDecision(plan: {
  warnings: string[];
}): string[] {
  return plan.warnings.filter((warning) => NEEDS_DECISION.test(warning));
}
