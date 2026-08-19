/**
 * Table assignment is free text ("3", "Table 3", "Head table"). Prefix
 * "Table" only when the value doesn't already name itself — never render
 * "Table Table 3".
 */
export function guestTableLabel(assignment: string): string {
  const trimmed = assignment.trim();
  return /^table\b/i.test(trimmed) ? trimmed : `Table ${trimmed}`;
}
