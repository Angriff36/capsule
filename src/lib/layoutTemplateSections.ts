/**
 * Venue layout template sections (spec §8.2). A template stores its sections
 * as JSON [{ type, instructions, sortOrder }]; an event copies them into its
 * own layout rows. Shared by the copy step (server) and the event page's
 * preview / "changed since the copy" view.
 */

export type LayoutSection = {
  readonly type: string;
  readonly instructions?: string;
};

/** Stored JSON -> sections in their saved order. Bad JSON reads as none. */
export function parseLayoutTemplateSections(
  json: string | null | undefined,
): LayoutSection[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      return {
        type: typeof row.type === "string" ? row.type.trim() : "",
        instructions:
          typeof row.instructions === "string" && row.instructions.trim()
            ? row.instructions
            : undefined,
        order: typeof row.sortOrder === "number" ? row.sortOrder : index,
      };
    })
    .filter((row) => row.type.length > 0)
    .sort((a, b) => a.order - b.order)
    .map(({ type, instructions }) => ({ type, instructions }));
}

export type LayoutDelta = {
  /** In the template now, not on the event (or the event changed it). */
  readonly onlyInTemplate: LayoutSection[];
  /** On the event from this copy, but the template no longer has it. */
  readonly onlyOnEvent: LayoutSection[];
};

const key = (section: LayoutSection) =>
  `${section.type.trim().toLowerCase()}\u0000${(section.instructions ?? "").trim()}`;

/** What differs between the template as it is now and the event rows copied
 * from it. Matching is by type + instructions, so an edit shows on both sides. */
export function layoutTemplateDelta(
  template: readonly LayoutSection[],
  eventRows: readonly LayoutSection[],
): LayoutDelta {
  const eventKeys = eventRows.map(key);
  const templateKeys = template.map(key);
  const remaining = [...eventKeys];
  const onlyInTemplate = template.filter((section) => {
    const at = remaining.indexOf(key(section));
    if (at === -1) return true;
    remaining.splice(at, 1);
    return false;
  });
  const left = [...templateKeys];
  const onlyOnEvent = eventRows.filter((row) => {
    const at = left.indexOf(key(row));
    if (at === -1) return true;
    left.splice(at, 1);
    return false;
  });
  return { onlyInTemplate, onlyOnEvent };
}
