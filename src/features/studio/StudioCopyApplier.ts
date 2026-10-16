import type { StudioCopySpot } from "./StudioCopySpot";

export type StudioCopyRow = {
  pagePattern: string;
  copyKey: string;
  originalText: string;
  text: string;
  targetSelector?: string | null;
  targetLabel?: string | null;
  deletedAt?: number | null;
  version?: number;
};

/**
 * Puts saved wording onto the live DOM after React paints. Only replaces
 * when the node still shows the original words or the saved words, so a
 * record name on another page is left alone.
 */
export class StudioCopyApplier {
  constructor(private readonly rows: readonly StudioCopyRow[]) {}

  apply(pagePattern: string): void {
    for (const row of this.rows) {
      if (row.deletedAt != null) continue;
      if (row.pagePattern !== pagePattern) continue;
      const element = this.findElement(row);
      if (!element) continue;
      this.write(element, row.originalText, row.text);
    }
  }

  displayedText(spot: StudioCopySpot): string {
    const row = this.rows.find(
      (item) =>
        item.deletedAt == null &&
        item.pagePattern === spot.pagePattern &&
        item.copyKey === spot.copyKey,
    );
    return row?.text ?? spot.originalText;
  }

  private findElement(row: StudioCopyRow): Element | null {
    if (!row.targetSelector) return null;
    try {
      return document.querySelector(row.targetSelector);
    } catch {
      return null;
    }
  }

  private write(element: Element, originalText: string, next: string): void {
    const current = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    if (current !== originalText && current !== next) return;
    if (current === next) return;
    const node = this.textNode(element);
    if (!node) return;
    node.textContent = next;
  }

  private textNode(element: Element): Text | null {
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? "";
        if (text.replace(/\s+/g, " ").trim().length > 0) return child as Text;
      }
    }
    if (element.childElementCount === 0) {
      const only = element.firstChild;
      if (only && only.nodeType === Node.TEXT_NODE) return only as Text;
    }
    return null;
  }
}
