import { jsPDF } from "jspdf";
import type { Doc } from "../../lib/api";
import { addPdfLogo, documentAddressLines } from "../admin/pdfBranding";
import {
  brandColorRgb,
  loadTenantBrandingForPdf,
  type TenantBranding,
} from "../admin/tenantBranding";
import { CULINARY_ALLERGENS } from "./CulinaryAllergenVocabulary";

export type MenuPdfLayout = "card" | "buffet";

export interface MenuDishLine {
  selection: Doc<"menuDishes">;
  dish: Doc<"dishes"> | undefined;
  /** Allergen codes for this dish (from the allergen matrix derivation). */
  allergens?: readonly string[];
}

export interface MenuPdfInput {
  menu: Doc<"menus">;
  dishes: MenuDishLine[];
  branding: TenantBranding;
  /** Single-column card (default) or two-column buffet list. */
  layout?: MenuPdfLayout;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 62;
const RIGHT = PAGE_WIDTH - MARGIN;
const FOOTER_Y = PAGE_HEIGHT - 34;
const DISHES_TOP = 62;

type Rgb = readonly [number, number, number];

const usd = (value: unknown) =>
  Number(value ?? 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

const slug = (value: unknown) =>
  String(value ?? "menu")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "menu";

/** Resolve allergen codes to their display labels, dropping unknown codes. */
const allergenLabels = (codes: readonly string[] | undefined): string[] =>
  (codes ?? [])
    .map((code) => CULINARY_ALLERGENS.find((entry) => entry.code === code))
    .filter((entry): entry is (typeof CULINARY_ALLERGENS)[number] =>
      Boolean(entry),
    )
    .map((entry) => entry.label);

export function menuPdfFileName(menu: Doc<"menus">): string {
  return `menu-${slug(menu.name)}.pdf`;
}

const dishDetails = (line: MenuDishLine): string =>
  [
    line.dish?.description,
    line.selection.serviceStyle,
    line.selection.specialInstructions,
  ]
    .filter(Boolean)
    .join(" · ");

/** Centered single-column "card" course listing. Returns the next y. */
function renderCardDishes(
  doc: jsPDF,
  dishes: MenuDishLine[],
  startY: number,
  primary: Rgb,
  accent: Rgb,
): number {
  let y = startY;
  let currentCourse = "";
  for (const line of dishes) {
    const { selection, dish } = line;
    const course = String(selection.course || dish?.course || "Selections");
    const details = dishDetails(line);
    doc.setFontSize(9);
    const detailLines = details
      ? (doc.splitTextToSize(details, 390) as string[])
      : [];
    const labels = allergenLabels(line.allergens);
    const needed = 46 + detailLines.length * 12 + (labels.length ? 12 : 0);
    if (y + needed > FOOTER_Y - 20) {
      doc.addPage();
      y = DISHES_TOP;
      currentCourse = "";
    }
    if (course !== currentCourse) {
      currentCourse = course;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...accent);
      doc.text(course.toUpperCase(), PAGE_WIDTH / 2, y, { align: "center" });
      doc.setDrawColor(...accent);
      doc.line(PAGE_WIDTH / 2 - 24, y + 8, PAGE_WIDTH / 2 + 24, y + 8);
      y += 28;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...primary);
    doc.text(String(dish?.name || "Unnamed dish"), PAGE_WIDTH / 2, y, {
      align: "center",
    });
    y += 17;
    if (detailLines.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 105, 102);
      doc.text(detailLines, PAGE_WIDTH / 2, y, { align: "center" });
      y += detailLines.length * 12;
    }
    if (labels.length > 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(...accent);
      doc.text(`Contains: ${labels.join(", ")}`, PAGE_WIDTH / 2, y, {
        align: "center",
      });
      y += 12;
    }
    y += 15;
  }
  return y;
}

/** Left-aligned two-column buffet list, flowing column-then-page. Returns next y. */
function renderBuffetDishes(
  doc: jsPDF,
  dishes: MenuDishLine[],
  startY: number,
  primary: Rgb,
  accent: Rgb,
): number {
  const GUTTER = 28;
  const colWidth = (PAGE_WIDTH - MARGIN * 2 - GUTTER) / 2;
  const colX = [MARGIN, MARGIN + colWidth + GUTTER];
  const colTop = startY;
  let col = 0;
  let y = startY;
  let currentCourse = "";

  for (const line of dishes) {
    const { selection, dish } = line;
    const course = String(selection.course || dish?.course || "Selections");
    doc.setFontSize(11);
    const nameLines = doc.splitTextToSize(
      String(dish?.name || "Unnamed dish"),
      colWidth,
    ) as string[];
    const details = dishDetails(line);
    doc.setFontSize(8.5);
    const detailLines = details
      ? (doc.splitTextToSize(details, colWidth) as string[])
      : [];
    const labels = allergenLabels(line.allergens);
    // Conservative height (assume a course header may render in this slot).
    const needed =
      22 +
      nameLines.length * 14 +
      detailLines.length * 11 +
      (labels.length ? 12 : 0) +
      12;
    if (y + needed > FOOTER_Y - 20) {
      if (col === 0) {
        col = 1;
        y = colTop;
      } else {
        doc.addPage();
        col = 0;
        y = DISHES_TOP;
      }
      currentCourse = "";
    }
    const x = colX[col];
    if (course !== currentCourse) {
      currentCourse = course;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...accent);
      doc.text(course.toUpperCase(), x, y);
      y += 16;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...primary);
    doc.text(nameLines, x, y);
    y += nameLines.length * 14;
    if (detailLines.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 105, 102);
      doc.text(detailLines, x, y);
      y += detailLines.length * 11;
    }
    if (labels.length > 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...accent);
      const allergenLine = doc.splitTextToSize(
        `Contains: ${labels.join(", ")}`,
        colWidth,
      ) as string[];
      doc.text(allergenLine, x, y);
      y += allergenLine.length * 10;
    }
    y += 12;
  }
  // Return the lower of the two columns so the footnote/price clear the list.
  return Math.min(y, FOOTER_Y - 20);
}

export function buildMenuPdf(input: MenuPdfInput): jsPDF {
  const { menu, dishes, branding, layout = "card" } = input;
  const primary = brandColorRgb(branding.primaryColor);
  const accent = brandColorRgb(branding.accentColor);
  const address = documentAddressLines(branding);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = 58;

  doc.setFillColor(...primary);
  doc.rect(0, 0, PAGE_WIDTH, 150, "F");
  const hasLogo = addPdfLogo(doc, branding, {
    x: MARGIN,
    y: 24,
    maxWidth: 104,
    maxHeight: 38,
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(branding.displayName, MARGIN, hasLogo ? 82 : y);
  if (address.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(224, 230, 226);
    doc.text(address.slice(0, 2), MARGIN, hasLogo ? 95 : y + 13);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(224, 230, 226);
  doc.text(String(menu.category || "CURATED MENU").toUpperCase(), RIGHT, 48, {
    align: "right",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255);
  const title = doc.splitTextToSize(String(menu.name), 300) as string[];
  doc.text(title, RIGHT, 75, { align: "right" });
  y = 184;

  if (menu.description) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(85, 91, 88);
    const description = doc.splitTextToSize(
      String(menu.description),
      430,
    ) as string[];
    doc.text(description, PAGE_WIDTH / 2, y, { align: "center" });
    y += description.length * 15 + 24;
  }

  const visibleDishes = dishes
    .filter(
      ({ selection }) =>
        selection.deletedAt == null && selection.removedAt == null,
    )
    .sort(
      (a, b) => Number(a.selection.sortOrder) - Number(b.selection.sortOrder),
    );
  if (visibleDishes.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(11);
    doc.setTextColor(105, 110, 107);
    doc.text("Menu selections are being finalized.", PAGE_WIDTH / 2, y, {
      align: "center",
    });
  } else if (layout === "buffet") {
    y = renderBuffetDishes(doc, visibleDishes, y, primary, accent);
  } else {
    y = renderCardDishes(doc, visibleDishes, y, primary, accent);
  }

  const priceY = Math.min(y + 20, FOOTER_Y - 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text(
    `${usd(menu.pricePerPerson)} per person · ${usd(menu.basePrice)} base`,
    PAGE_WIDTH / 2,
    priceY,
    { align: "center" },
  );

  if (visibleDishes.some((line) => allergenLabels(line.allergens).length > 0)) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(120, 125, 122);
    const note = doc.splitTextToSize(
      "Allergen indicators derive from component ingredient classifications and dish-level declarations. Unflagged dishes are not certified allergen-free — confirm with the kitchen.",
      PAGE_WIDTH - MARGIN * 2,
    ) as string[];
    doc.text(note, PAGE_WIDTH / 2, Math.min(priceY + 16, FOOTER_Y - 18), {
      align: "center",
    });
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(115, 120, 117);
    doc.text(branding.displayName, MARGIN, FOOTER_Y);
    doc.text(`${page} / ${pages}`, RIGHT, FOOTER_Y, { align: "right" });
  }
  return doc;
}

export async function downloadMenuPdf(input: MenuPdfInput): Promise<void> {
  const branding = await loadTenantBrandingForPdf(input.branding);
  buildMenuPdf({ ...input, branding }).save(menuPdfFileName(input.menu));
}
