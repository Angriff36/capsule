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
    return new StudioCopySpot(
      pagePattern,
      this.cssPath(element),
      originalText,
      this.readableLabel(element),
    );
  }
}
