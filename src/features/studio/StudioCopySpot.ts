const LAYER_SKIP = "[data-studio-layer],[data-feedback-layer]";
const SKIP_TAGS = new Set([
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "OPTION",
  "SCRIPT",
  "STYLE",
  "SVG",
  "PATH",
  "IMG",
  "VIDEO",
  "CANVAS",
]);

/** One clickable bit of wording on a screen. */
export class StudioCopySpot {
  constructor(
    readonly pagePattern: string,
    readonly selector: string,
    readonly originalText: string,
    readonly targetLabel: string,
  ) {}

  // The spot's place on the screen, never its words: once saved wording
  // shows, picking the same spot again must find the same row.
  get copyKey(): string {
    return this.selector.slice(0, 500);
  }

  static cssPath(element: Element): string {
    const parts: string[] = [];
    let node: Element | null = element;
    while (
      node &&
      node !== document.body &&
      node !== document.documentElement
    ) {
      if (node.id && !/\d{4,}|:/.test(node.id)) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        return parts.join(" > ");
      }
      const parent: Element | null = node.parentElement;
      if (!parent) break;
      const tag = node.tagName.toLowerCase();
      const same = Array.from(parent.children).filter(
        (child) => child.tagName === node!.tagName,
      );
      parts.unshift(
        same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag,
      );
      node = parent;
    }
    return ["body", ...parts].join(" > ");
  }

  static readableLabel(element: Element): string {
    const named =
      element.getAttribute("aria-label") ??
      element.getAttribute("title") ??
      element.textContent ??
      "";
    const text = named.replace(/\s+/g, " ").trim().slice(0, 80);
    const tag = element.tagName.toLowerCase();
    return text ? `${tag} "${text}"` : tag;
  }

  static leafText(element: Element): string {
    const raw = element.textContent ?? "";
    return raw.replace(/\s+/g, " ").trim();
  }

  /**
   * The one text node that holds all of a spot's words, or null when the
   * words are split over several parts ("Orders <b>3</b>"): the applier can
   * only change one text node, so a split label is not offered for editing.
   */
  static wordsNode(element: Element): Text | null {
    const all = this.leafText(element);
    if (!all) return null;
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType !== Node.TEXT_NODE) continue;
      const words = (child.textContent ?? "").replace(/\s+/g, " ").trim();
      if (words) return words === all ? (child as Text) : null;
    }
    return null;
  }

  /** The element whose aria-label names this spot for screen readers. */
  static namer(element: Element): Element | null {
    if (element.hasAttribute("aria-label")) return element;
    const control = element.closest(
      "button, a, [role='button'], [role='tab'], [role='link'], [role='menuitem']",
    );
    return control?.hasAttribute("aria-label") ? control : null;
  }

  static ariaName(element: Element): string {
    return (element.getAttribute("aria-label") ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  static isSkippable(element: Element): boolean {
    if (SKIP_TAGS.has(element.tagName)) return true;
    if (element.closest(LAYER_SKIP)) return true;
    if (element.closest("input, textarea, select, [contenteditable=true]"))
      return true;
    return false;
  }

  static fromElement(
    element: Element,
    pagePattern: string,
  ): StudioCopySpot | null {
    if (this.isSkippable(element)) return null;
    if (element.querySelector("select, option, textarea, input")) return null;
    const originalText = this.leafText(element);
    if (!originalText || originalText.length > 80) return null;
    if (!this.wordsNode(element)) return null;
    // A screen-reader name that differs from the words cannot be kept in
    // step with an edit, so that spot is not offered.
    const namer = this.namer(element);
    if (namer && this.ariaName(namer) !== originalText) return null;
    return new StudioCopySpot(
      pagePattern,
      this.cssPath(element),
      originalText,
      this.readableLabel(element),
    );
  }
}
