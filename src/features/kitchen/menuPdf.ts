import { jsPDF } from "jspdf";
import type { Doc } from "../../lib/api";
import { addPdfLogo, documentAddressLines } from "../admin/pdfBranding";
import {
  brandColorRgb,
  loadTenantBrandingForPdf,
  type TenantBranding,
} from "../admin/tenantBranding";

export interface MenuDishLine {
  selection: Doc<"menuDishes">;
  dish: Doc<"dishes"> | undefined;
}

export interface MenuPdfInput {
  menu: Doc<"menus">;
  dishes: MenuDishLine[];
  branding: TenantBranding;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 62;
const RIGHT = PAGE_WIDTH - MARGIN;
const FOOTER_Y = PAGE_HEIGHT - 34;

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

export function menuPdfFileName(menu: Doc<"menus">): string {
  return `menu-${slug(menu.name)}.pdf`;
}

export function buildMenuPdf(input: MenuPdfInput): jsPDF {
  const { menu, dishes, branding } = input;
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
  } else {
    let currentCourse = "";
    for (const { selection, dish } of visibleDishes) {
      const course = String(selection.course || dish?.course || "Selections");
      const details = [
        dish?.description,
        selection.serviceStyle,
        selection.specialInstructions,
      ]
        .filter(Boolean)
        .join(" · ");
      const detailLines = details
        ? (doc.splitTextToSize(details, 390) as string[])
        : [];
      const needed = 46 + detailLines.length * 12;
      if (y + needed > FOOTER_Y - 20) {
        doc.addPage();
        y = 62;
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
      y += 15;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text(
    `${usd(menu.pricePerPerson)} per person · ${usd(menu.basePrice)} base`,
    PAGE_WIDTH / 2,
    Math.min(y + 20, FOOTER_Y - 24),
    { align: "center" },
  );

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
