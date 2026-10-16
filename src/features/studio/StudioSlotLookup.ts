/** Finds the catalog block under a click, including a nearby sibling. */
export class StudioSlotLookup {
  static from(element: Element): HTMLElement | null {
    const direct = element.closest("[data-studio-slot]");
    if (direct instanceof HTMLElement) return direct;
    let node: HTMLElement | null =
      element instanceof HTMLElement ? element : element.parentElement;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const hit = node.querySelector("[data-studio-slot]");
      if (hit instanceof HTMLElement) return hit;
      node = node.parentElement;
    }
    const root = element.closest("main") ?? document.body;
    const masthead = root.querySelector("[data-studio-kind='masthead']");
    return masthead instanceof HTMLElement ? masthead : null;
  }
}
