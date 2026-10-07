/**
 * AC-140 (PR11-01): every archived TPP workbook and every report the archive
 * index names maps to a native Capsule report or screen, by TPP report name,
 * never by a look-alike name. When the owner's archive is on this machine
 * (TPP_ARCHIVE_DIR, default .artifacts/tpp-migration-20260905/...), the file
 * list and the heading inside each workbook are read back from the files.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { TPP_REPORT_BY_ID } from "../src/features/reports/tpp/catalog";
import {
  TPP_ARCHIVE_WORKBOOKS,
  TPP_INDEX_WITHOUT_WORKBOOK,
} from "../src/features/reports/tpp/workbookInventory";
import { readXlsxSheets } from "../src/lib/tppReports/xlsxReader";

/** Every report name in the archive's report_index.md. */
const INDEX_NAMES = [
  // Already had
  "Address & Phone List",
  "Birthday List",
  "Order Activity List",
  "Contact Letter Builder",
  "Contract For Service",
  // Event scope
  "Event Booking",
  "Event Changes",
  "Event List",
  "Event Menu",
  "Event Timeline",
  "Event Worksheet",
  "Proposal of Service",
  "Invoice Event",
  "Packing Slip",
  "Beverage Order List by Vendor",
  "Event BEO",
  "Event Delivery Addresses",
  "Event Menu Item Labels",
  "Event Menu Item Production",
  "Event Schedule",
  "Event Tasks & Notes",
  "Heating and Serving Event Menu",
  "Master Food Production Worksheet",
  "Miscellaneous Order List By Vendor",
  "Order List",
  "Pack List",
  "Production Summary",
  "Rental Order List by Vendor",
  "Shopping List",
  "Staff Schedules",
  "Equipment Summary",
  "Menu Item Cost per Event",
  // Company-wide lists
  "Contact Activity",
  "Contact Event Envelope",
  "Contact Task & Notes",
  "Events Pending Final Confirmation",
  "Mailing Labels",
  "Menu Item Listing Report",
  "Menu Item Packages",
  "Menu Item Popularity",
  "Inventory In-Stock",
  "Staff Address & Phone List",
  "Vendor Phone List",
  "Venue Detail",
  "Venue Listing",
  "Invoice Number History",
  // Financial
  "A/R Aging Detail",
  "Accounts Receivable",
  "Accounts Receivable - New",
  "Average Event Spending per Guest",
  "Beverage Costs",
  "Beverage Totals",
  "Contact Payments",
  "Contact Statement/Receivables",
  "Credit Card Transactions",
  "Event Discount Summary",
  "Event Other Fee(s)",
  "Event Revenue by Client",
  "Event Sales by Referral",
  "Event Scheduled Payments",
  "Ledger / Food and Beverage Sales",
  "Lost Revenue by Cancellation Reason",
  "Menu Item Itemized Sales",
  "Menu Item Sales by Category",
  "Miscellaneous Totals",
  "Outstanding Deposits",
  "Outstanding Proposals",
  "Payment Totals",
  "Platform Fee + Gratuity Summary",
  "Rental Charges",
  "Sales Forecasting",
  "Snapshot Revenue",
  "Staff Earnings",
  "Staffing Charges",
  "Tax Exempt - New",
  "Taxable Sales",
  "Venue Sales",
  // Blocked in TPP
  "Profit Summary",
  "Menu Item Costing",
  "Menu Item Recipes",
  "Menu Item Table Tents",
  // No data returned
  "Heating & Serving - Labels",
  "Kitchen Labor",
  "Other Inventory Order List by Vendor",
  "Contact/Lead Opportunities",
  "Post Event Notes",
  "Inventory Cost Changes",
  // Skipped
  "Contact Worksheet (Blank)",
];

const same = (a: string, b: string) =>
  a.replace(/\s+/g, " ").trim().toLowerCase() ===
  b.replace(/\s+/g, " ").trim().toLowerCase();

describe("TPP report archive inventory (AC-140)", () => {
  it("lists all 90 workbooks once, by folder", () => {
    const files = TPP_ARCHIVE_WORKBOOKS.map((entry) => entry.file);
    expect(files).toHaveLength(90);
    expect(new Set(files).size).toBe(90);
    const folder = (prefix: string) =>
      files.filter((file) => file.startsWith(prefix)).length;
    expect(folder("event_specific/")).toBe(27);
    expect(folder("company_wide/recipes_by_category/")).toBe(16);
    expect(folder("company_wide/")).toBe(31);
    expect(folder("financial_history/")).toBe(32);
  });

  it("maps each workbook to the native report OF THE SAME TPP report", () => {
    for (const entry of TPP_ARCHIVE_WORKBOOKS) {
      if (entry.use.kind !== "report") continue;
      const native = TPP_REPORT_BY_ID.get(entry.use.reportId);
      expect(native, entry.file).toBeDefined();
      expect(same(native!.name, entry.tppReport), entry.file).toBe(true);
    }
  });

  it("never folds two different TPP reports into one native report", () => {
    const byReport = new Map<string, Set<string>>();
    for (const entry of TPP_ARCHIVE_WORKBOOKS) {
      if (entry.use.kind !== "report") continue;
      const names = byReport.get(entry.use.reportId) ?? new Set<string>();
      names.add(entry.tppReport);
      byReport.set(entry.use.reportId, names);
    }
    for (const [reportId, names] of byReport)
      expect([...names], reportId).toHaveLength(1);
  });

  it("sends the cookbook slices to a screen that exists", () => {
    const app = readFileSync("src/app/App.tsx", "utf8");
    const screens = TPP_ARCHIVE_WORKBOOKS.filter(
      (entry) => entry.use.kind === "screen",
    );
    expect(screens).toHaveLength(16);
    for (const entry of screens) {
      expect(entry.tppReport).toBe("Menu Item Recipes");
      if (entry.use.kind === "screen") {
        expect(app).toContain(`path="${entry.use.route}"`);
        expect(entry.use.what.length).toBeGreaterThan(0);
      }
    }
  });

  it("accounts for every report the archive index names", () => {
    const withWorkbook = new Set(
      TPP_ARCHIVE_WORKBOOKS.map((entry) => entry.tppReport),
    );
    for (const name of INDEX_NAMES) {
      const other = TPP_INDEX_WITHOUT_WORKBOOK.find((entry) =>
        same(entry.tppReport, name),
      );
      expect(withWorkbook.has(name) || other !== undefined, name).toBe(true);
    }
    for (const entry of TPP_INDEX_WITHOUT_WORKBOOK) {
      expect(INDEX_NAMES, entry.tppReport).toContain(entry.tppReport);
      const native = TPP_REPORT_BY_ID.get(entry.reportId);
      expect(native, entry.tppReport).toBeDefined();
      expect(same(native!.name, entry.tppReport), entry.tppReport).toBe(true);
      expect(entry.why.length).toBeGreaterThan(0);
    }
  });

  const archive =
    process.env.TPP_ARCHIVE_DIR ??
    ".artifacts/tpp-migration-20260905/tpp_migration/reports";
  it.skipIf(!existsSync(archive))(
    "matches the owner's archive files and the heading inside each",
    () => {
      const walk = (dir: string): string[] =>
        readdirSync(dir).flatMap((name) => {
          const path = join(dir, name);
          return statSync(path).isDirectory() ? walk(path) : [path];
        });
      const onDisk = walk(archive)
        .filter((path) => path.endsWith(".xlsx"))
        .map((path) => relative(archive, path).split(sep).join("/"))
        .sort();
      expect(onDisk).toEqual(
        TPP_ARCHIVE_WORKBOOKS.map((entry) => entry.file).sort(),
      );
      for (const entry of TPP_ARCHIVE_WORKBOOKS) {
        if (entry.sourceHeading === null) continue;
        const rows = readXlsxSheets(
          readFileSync(join(archive, entry.file)),
        ).flatMap((sheet) => sheet.rows);
        const top = rows
          .slice(0, 6)
          .map((row) => row.join(" "))
          .join(" ");
        expect(top, entry.file).toContain(entry.sourceHeading);
      }
    },
  );
});
