/**
 * The version (tab) name for how a dish is finished, read from a catalog
 * category or a TPP report category ("Apps - Passed - Finish at Event",
 * "Finish at Kitchen", "Drop Off - Individual"). Ryan 2026-10-04: one food,
 * one main dish, its finishing ways as versions.
 */
export function finishVersionLabel(
  category: string | null | undefined,
  name = "",
): string | undefined {
  const c =
    `${category ?? ""} ${/passed/i.test(name) ? "passed" : ""}`.toLowerCase();
  if (/passed/.test(c)) return "Passed";
  if (/drop ?off/.test(c)) return "Drop Off";
  if (/vending/.test(c)) return "Vending";
  if (/action station/.test(c)) return "Action Station";
  if (/ready to heat/.test(c)) return "Ready to Heat";
  if (/air catering/.test(c)) return "Air Catering";
  if (/finish at event/.test(c)) return "Finish at Event";
  if (/finish at kitchen/.test(c)) return "Finish at Kitchen";
  return category?.trim() || undefined;
}
