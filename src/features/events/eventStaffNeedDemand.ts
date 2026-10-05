/** Plain result of an auto-fill: who went where, and what is still open. */
export function autoFillSummary(result: {
  filled: readonly { role: string; name: string }[];
  left: readonly { role: string; reason: string }[];
}): string {
  const filled = result.filled.length
    ? `Filled ${result.filled.length}: ${result.filled.map((row) => `${row.name} (${row.role})`).join(", ")}.`
    : "Nobody was filled.";
  const left = result.left.length
    ? ` Still open: ${result.left.map((row) => `${row.role} - ${row.reason.toLowerCase()}`).join("; ")}.`
    : "";
  return filled + left;
}

/** One plain line of what a staffing need asks for (AC-504), or "". */
export function staffNeedDemandSummary(need: {
  qualificationName?: string | null;
  certificationType?: string | null;
  skills?: string | null;
  uniform?: string | null;
  workLocation?: string | null;
  payBasis?: string | null;
  budgetHourlyRate?: number | null;
  templateSlot?: number | null;
}): string {
  const parts: string[] = [];
  if (need.qualificationName?.trim())
    parts.push(`Needs ${need.qualificationName.trim()} certificate`);
  if (need.skills?.trim()) parts.push(`Skills: ${need.skills.trim()}`);
  if (need.uniform?.trim()) parts.push(`Wear: ${need.uniform.trim()}`);
  if (need.workLocation?.trim()) parts.push(`At: ${need.workLocation.trim()}`);
  const pay =
    need.payBasis === "flat_rate"
      ? "Flat rate"
      : need.payBasis === "hourly"
        ? "Hourly"
        : null;
  const budget =
    need.budgetHourlyRate != null
      ? `budget $${need.budgetHourlyRate.toFixed(2)}/hr`
      : null;
  if (pay || budget) parts.push([pay, budget].filter(Boolean).join(", "));
  if (need.templateSlot != null)
    parts.push(`Crew template spot ${need.templateSlot}`);
  return parts.join(" · ");
}
