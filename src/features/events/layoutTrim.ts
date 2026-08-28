/** Layouts load-path trim. Coerce or skip non-strings before .trim(). */

export function trimLayoutField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Event.accessibilityNeeds is string[] in the schema. The layouts rail used
 * to call .trim() on that array ("M.trim is not a function").
 * Join recorded string items; skip anything that is not a string.
 */
export function layoutAccessibilityText(value: unknown): string | null {
  if (Array.isArray(value)) {
    const text = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .join(", ");
    return text || null;
  }
  return trimLayoutField(value) || null;
}

export function layoutAreaLabel(type: unknown): string {
  return trimLayoutField(type) || "Unnamed area";
}

export function layoutHasInstructions(instructions: unknown): boolean {
  return trimLayoutField(instructions).length > 0;
}

export type LayoutFieldCounts = {
  readonly label: string;
  readonly count: number;
};

/** Category rail for the layouts tab. Non-string types become Unnamed area. */
export function layoutCategoryCounts(
  sections: readonly { readonly type?: unknown }[],
): LayoutFieldCounts[] {
  const counts = new Map<string, number>();
  for (const section of sections) {
    const label = layoutAreaLabel(section.type);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
}
