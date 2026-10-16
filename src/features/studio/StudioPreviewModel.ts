import type { StudioBlockModel } from "./StudioCatalog";

/** Words fed into Now/After catalog miniatures. */
export class StudioPreviewModel {
  static from(title: string, lead?: string): StudioBlockModel {
    const trimmed = title.replace(/\s+/g, " ").trim().slice(0, 80);
    return {
      title: trimmed || "This block",
      lead: lead || "Same words, different catalog piece.",
      value: trimmed || "—",
    };
  }
}
