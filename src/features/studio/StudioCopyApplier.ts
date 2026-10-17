import { StudioCopySpot } from "./StudioCopySpot";

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

const written = StudioCopySpot.written;

/**
 * Puts saved wording onto the live DOM after React paints. Only replaces
 * when the node still shows the original words, the saved words or words
 * the applier wrote itself, so a record name on another page is left alone.
 */
export class StudioCopyApplier {
  constructor(private readonly rows: readonly StudioCopyRow[]) {}

  apply(pagePattern: string): void {
    const live = new Set<Element>();
    for (const row of this.rows) {
      if (row.deletedAt != null) continue;
      if (row.pagePattern !== pagePattern) continue;
      const element = this.findElement(row);
      // A saved row on words that are not marked interface text (a dish
      // name, a price) never changes what the screen shows.
      if (!element || !StudioCopySpot.isAuthoredCopy(element, pagePattern))
        continue;
      live.add(element);
      this.write(element, row.originalText, row.text);
    }
    for (const [element, mark] of Array.from(written)) {
      if (live.has(element)) continue;
      written.delete(element);
      if (!element.isConnected) continue;
      if (this.current(element) !== mark.text) continue;
      const node = StudioCopySpot.wordsNode(element);
      if (!node) continue;
      node.textContent = mark.original;
      this.rename(element, mark.text, mark.original);
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

  private current(element: Element): string {
    return (element.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  private write(element: Element, originalText: string, next: string): void {
    const current = this.current(element);
    const mine = written.get(element)?.text === current;
    if (current !== originalText && current !== next && !mine) return;
    if (current !== next) {
      const node = StudioCopySpot.wordsNode(element);
      if (!node) return;
      node.textContent = next;
    }
    this.rename(element, current, next);
    written.set(element, { original: originalText, text: next });
  }

  // Keeps a control's screen-reader name in step with the words it shows.
  private rename(element: Element, from: string, to: string): void {
    const namer = StudioCopySpot.namer(element);
    if (namer && StudioCopySpot.ariaName(namer) === from)
      namer.setAttribute("aria-label", to);
  }
}
