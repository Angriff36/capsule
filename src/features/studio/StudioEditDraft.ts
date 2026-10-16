import type { StudioCatalogKind } from "./StudioCatalog";
import { StudioCopySpot } from "./StudioCopySpot";
import { StudioSlotLookup } from "./StudioSlotLookup";

export type StudioSlotDraft = {
  kind: StudioCatalogKind;
  name: string;
  slotKey: string;
  selector: string;
  label: string;
  previewTitle: string;
  /** Shows tabs, buttons, links or content a catalog stand-in drops. */
  live: boolean;
};

export type StudioEditDraft = {
  x: number;
  y: number;
  copy: StudioCopySpot;
  slot: StudioSlotDraft | null;
  /** False when the click hit a whole block, not one short label. */
  copyEditable: boolean;
};

export class StudioEditDraftFactory {
  static fromPoint(
    x: number,
    y: number,
    pagePattern: string,
    layerAttr: string,
  ): StudioEditDraft | null {
    const element = document
      .elementsFromPoint(x, y)
      .find((node) => !node.closest(`[${layerAttr}]`));
    if (!element) return null;
    const copy = StudioCopySpot.fromElement(element, pagePattern);
    const slotRoot = StudioSlotLookup.from(element);
    const slot = slotRoot ? this.slotFrom(slotRoot) : null;
    if (!copy && !slot) return null;
    const fallback = copy;
    const originalText = fallback?.originalText ?? "";
    return {
      x,
      y,
      copy:
        fallback ??
        new StudioCopySpot(
          pagePattern,
          StudioCopySpot.cssPath(slotRoot as Element),
          slot?.previewTitle ?? "",
          slot?.label ?? "block",
        ),
      slot,
      copyEditable: originalText.length > 0 && originalText.length <= 80,
    };
  }

  private static slotFrom(root: HTMLElement): StudioSlotDraft | null {
    const kind = root.dataset.studioKind as StudioCatalogKind | undefined;
    const name = root.dataset.studioSlot;
    const slotKey = root.dataset.studioKey;
    if (!kind || !name || !slotKey) return null;
    return {
      kind,
      name,
      slotKey,
      selector: StudioCopySpot.cssPath(root),
      label: StudioCopySpot.readableLabel(root),
      previewTitle: this.headingFrom(root, name),
      live:
        root.dataset.studioLive === "true" ||
        root.querySelector(
          "a[href], button, input, select, textarea, [role='tab'], [tabindex]",
        ) != null,
    };
  }

  private static headingFrom(root: HTMLElement, fallback: string): string {
    const heading = root.querySelector("h1, h2, h3, legend");
    const raw =
      heading?.textContent ?? root.getAttribute("aria-label") ?? fallback;
    return raw.replace(/\s+/g, " ").trim().slice(0, 80) || fallback;
  }
}
