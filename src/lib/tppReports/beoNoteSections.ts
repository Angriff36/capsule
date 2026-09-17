import type { BundleNotes } from "./eventBundle";

/**
 * The BEO prints its setup prose under fixed headings. Both the workbook and
 * the pasted-text readers split on the same list so a note lands in the same
 * bundle field whichever way the report arrived.
 */
export const BEO_NOTE_HEADINGS = [
  "Event Overview",
  "Menu / Culinary Notes",
  "Operations Notes",
  "Buffetware / Servingware",
  "Decor Collection / Linen",
  "Equipment & Rentals",
  "Service Setup / Layout",
  "Catering Kitchen / Staging",
  "Additional Tasks / Responsibilities of Mangia",
] as const;

/** Split one prose blob into its headed sections. Headings absent are omitted. */
export function splitBeoNoteSections(blob: string): Record<string, string> {
  const found: Array<{ heading: string; index: number }> = [];
  for (const heading of BEO_NOTE_HEADINGS) {
    const index = blob.indexOf(heading);
    if (index >= 0) found.push({ heading, index });
  }
  found.sort((a, b) => a.index - b.index);

  const sections: Record<string, string> = {};
  found.forEach((entry, position) => {
    const start = entry.index + entry.heading.length;
    const end = found[position + 1]?.index ?? blob.length;
    const text = blob.slice(start, end).trim();
    if (text.length > 0) sections[entry.heading] = text;
  });
  return sections;
}

/** Map headed sections onto the bundle's note fields. */
export function bundleNotesFromSections(
  sections: Record<string, string>,
): BundleNotes {
  return {
    eventOverview: sections["Event Overview"],
    menuNotes: sections["Menu / Culinary Notes"],
    operationsNotes: sections["Operations Notes"],
    serviceSetup: sections["Service Setup / Layout"],
    cateringKitchen: sections["Catering Kitchen / Staging"],
    equipmentRentals: sections["Equipment & Rentals"],
    decor: sections["Decor Collection / Linen"],
    additionalTasks: sections["Additional Tasks / Responsibilities of Mangia"],
  };
}
