/**
 * Controls a screen reader would announce with no name: buttons, links and
 * form fields with no text, aria-label, aria-labelledby, title or label.
 * Returns one short description per control so a failure says which one.
 */
export function unnamedControls(root: ParentNode): string[] {
  const misses: string[] = [];
  const controls = root.querySelectorAll<HTMLElement>(
    'button, a[href], summary, input:not([type="hidden"]), select, textarea, [role="button"], [role="menuitem"], [role="tab"]',
  );
  for (const control of controls) {
    if (control.closest('[hidden], [aria-hidden="true"]')) continue;
    if (nameOf(control)) continue;
    misses.push(
      `${control.tagName.toLowerCase()}${control.className ? `.${String(control.className).split(" ")[0]}` : ""} in "${(control.parentElement?.textContent ?? "").trim().slice(0, 60)}"`,
    );
  }
  return misses;
}

function nameOf(control: HTMLElement): string {
  const aria = control.getAttribute("aria-label")?.trim();
  if (aria) return aria;
  const labelledBy = control.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => control.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (text) return text;
  }
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLSelectElement ||
    control instanceof HTMLTextAreaElement
  ) {
    const labels = [...(control.labels ?? [])]
      .map((label) => label.textContent ?? "")
      .join(" ")
      .trim();
    if (labels) return labels;
    if (
      control instanceof HTMLInputElement &&
      ["submit", "button", "reset"].includes(control.type)
    )
      return control.value.trim();
  } else {
    const text = (control.textContent ?? "").trim();
    if (text) return text;
    const img = control.querySelector("img[alt]");
    const alt = img?.getAttribute("alt")?.trim();
    if (alt) return alt;
  }
  return control.getAttribute("title")?.trim() ?? "";
}
