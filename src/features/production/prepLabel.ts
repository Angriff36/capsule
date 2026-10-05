import {
  allergenLabel,
  deriveDishAllergens,
  dishAllergenClaim,
  type AllergenSourceRecord,
  type DishAllergenInput,
} from "../kitchen/dishAllergens";

/**
 * Dated container labels for prepped food: product, prep date, use-by date,
 * allergens and who prepped it. The use-by date comes from the recipe's
 * confirmed storage window when one is on file; otherwise the cook enters
 * it, because an ingredient's shelf life is not a finished food's.
 */

export type PrepLabelStock = "sheet" | "thermal";

export const PREP_LABEL_STOCKS: Array<{
  value: PrepLabelStock;
  label: string;
}> = [
  { value: "sheet", label: 'Sheet labels — 2" × 4", 10 per letter page' },
  { value: "thermal", label: 'Thermal roll — 2.25" × 1.25", one per label' },
];

export type PrepLabel = {
  product: string;
  detail?: string;
  preparedAt: number;
  useBy: number;
  allergens: string;
  preparedBy: string;
};

const SOURCE_ID = "__prep-label__";

/**
 * Allergen line for a label. A prep task or batch makes a recipe
 * (component) or a dish; both read through the same recipe derivation the
 * allergen matrix uses. Never prints "none" unless every line is flagged.
 */
export function prepLabelAllergens(
  target: { componentId?: string | null; dish?: AllergenSourceRecord | null },
  input: DishAllergenInput,
): string {
  const source: AllergenSourceRecord | null = target.componentId
    ? { _id: SOURCE_ID }
    : (target.dish ?? null);
  if (!source) return "Allergens not verified — check the recipe";
  const report = deriveDishAllergens(source, {
    ...input,
    dishComponents: target.componentId
      ? [
          {
            _id: SOURCE_ID,
            dishId: SOURCE_ID,
            componentId: target.componentId,
          },
        ]
      : input.dishComponents,
  });
  const claim = dishAllergenClaim(report);
  if (claim === "clear") return "Allergens: none";
  if (claim === "unverified")
    return "Allergens not verified — check the recipe";
  const named = `Contains: ${report.codes.map(allergenLabel).join(", ")}`;
  return report.unresolvedCount > 0 || report.unflaggedCount > 0
    ? `${named} (may contain more — check the recipe)`
    : named;
}

/** Use-by from a confirmed storage window; null when none is on file. */
export function prepLabelUseBy(
  preparedAt: number,
  storageWindowDays: number | null | undefined,
): number | null {
  if (storageWindowDays == null || storageWindowDays <= 0) return null;
  return preparedAt + storageWindowDays * 86_400_000;
}

/** "YYYY-MM-DDTHH:MM" in local time, the value a datetime-local input takes. */
export function toLocalInput(time: number): string {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );

const stamp = (time: number) =>
  new Date(time).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const PAGE_CSS: Record<PrepLabelStock, string> = {
  sheet:
    "@page{size:letter;margin:0.5in 0.16in}body{margin:0;display:grid;grid-template-columns:4in 4in;column-gap:0.19in;grid-auto-rows:2in}.label{height:2in;padding:0.14in 0.18in;font-size:11pt}.label h1{font-size:16pt}",
  thermal:
    "@page{size:2.25in 1.25in;margin:0}body{margin:0}.label{width:2.25in;height:1.25in;padding:0.06in 0.08in;font-size:7pt;page-break-after:always;break-after:page}.label h1{font-size:10pt}",
};

/** A full printable HTML page with `copies` identical labels. */
export function prepLabelDocument(
  label: PrepLabel,
  stock: PrepLabelStock,
  copies: number,
): string {
  const one = `<section class="label"><h1>${escapeHtml(label.product)}</h1>${
    label.detail ? `<p class="detail">${escapeHtml(label.detail)}</p>` : ""
  }<p><b>Prepped</b> ${escapeHtml(stamp(label.preparedAt))}</p><p class="use-by"><b>USE BY</b> ${escapeHtml(stamp(label.useBy))}</p><p class="allergens">${escapeHtml(label.allergens)}</p><p><b>By</b> ${escapeHtml(label.preparedBy)}</p></section>`;
  const count = Math.min(100, Math.max(1, Math.floor(copies) || 1));
  return `<!doctype html><html><head><title>${escapeHtml(label.product)} label</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#000}.label{overflow:hidden;display:flex;flex-direction:column;gap:0.04in}.label h1{margin:0;line-height:1.1}.label p{margin:0;line-height:1.2}.detail{color:#333}.use-by{font-size:1.2em}.allergens{font-weight:bold}${PAGE_CSS[stock]}</style></head><body>${one.repeat(count)}</body></html>`;
}

/** Opens the labels in a new window and starts the browser print dialog. */
export function printPrepLabels(
  label: PrepLabel,
  stock: PrepLabelStock,
  copies: number,
): boolean {
  const page = window.open("", "_blank", "width=520,height=640");
  if (!page) return false;
  page.document.write(prepLabelDocument(label, stock, copies));
  page.document.close();
  page.focus();
  page.print();
  return true;
}
