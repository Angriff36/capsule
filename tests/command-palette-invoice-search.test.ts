import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  displayInvoiceNumber,
  extractInvoiceNumbers,
  invoiceMatchesQuery,
  invoiceSearchLabel,
  invoiceStatusFilter,
  keepInvoiceForSearch,
  parseSearchQuery,
  shouldQueryInvoices,
} from "../convex/lib/parseSearchQuery";

const NOW = Date.parse("2026-08-19T18:00:00Z");

const qa1 = {
  invoiceNumber: "INV-2026-QA1",
  _id: "k17qa1invoice000000000000000001",
  amountDue: 0,
  total: 3600,
  amountPaid: 3600,
  currencyCode: "USD",
  status: "paid",
};

describe("Ctrl-K settled invoice NL paints invoice hits", () => {
  it("keeps INV-2026-QA1 as one token instead of splitting on hyphens", () => {
    expect(extractInvoiceNumbers("#INV-2026-QA1")).toEqual(["inv-2026-qa1"]);
    expect(extractInvoiceNumbers("INV-2026")).toEqual(["inv-2026"]);
    // The word "invoices" is not an invoice number.
    expect(extractInvoiceNumbers("unpaid invoices")).toEqual([]);
    expect(extractInvoiceNumbers("unpaid invoices over 30 days")).toEqual([]);
  });

  it("routes #INV-2026-QA1 and INV-2026 onto the invoice query, including paid", () => {
    for (const raw of ["#INV-2026-QA1", "INV-2026"]) {
      const parsed = parseSearchQuery(raw, NOW);
      expect(parsed.invoiceNumbers[0]).toMatch(/^inv-2026/);
      expect(parsed.term).toBe("");
      expect(shouldQueryInvoices(parsed)).toBe(true);
      expect(invoiceStatusFilter(parsed)).toBeNull();
      expect(invoiceMatchesQuery(qa1, parsed)).toBe(true);
    }
  });

  it("unpaid invoices still queries invoices without requiring the number in the label", () => {
    const parsed = parseSearchQuery("unpaid invoices", NOW);
    expect(parsed.kinds.has("invoice")).toBe(true);
    expect(parsed.statuses.has("unpaid")).toBe(true);
    expect(parsed.invoiceNumbers).toEqual([]);
    expect(shouldQueryInvoices(parsed)).toBe(true);
    const statuses = invoiceStatusFilter(parsed);
    expect(statuses?.has("draft")).toBe(true);
    expect(statuses?.has("overdue")).toBe(true);
    expect(statuses?.has("paid")).toBe(false);
    // No number token: every unpaid-status row matches the text filter.
    expect(
      invoiceMatchesQuery(
        { invoiceNumber: "INV-8BJQS7", _id: "draft1" },
        parsed,
      ),
    ).toBe(true);
  });

  it("unpaid invoices over 30 days still sets agedOverDays", () => {
    const parsed = parseSearchQuery("unpaid invoices over 30 days", NOW);
    expect(parsed.agedOverDays).toBe(30);
    expect(parsed.kinds.has("invoice")).toBe(true);
    expect(shouldQueryInvoices(parsed)).toBe(true);
  });

  it("matches folio display numbers when invoiceNumber is a raw document id", () => {
    const rawId = "nn74xc7n0pdk5cmkm5z8zn7gbd8bdp6q";
    const invoiceId = "k17holidayfolio00008bjqs7";
    const inv = { invoiceNumber: rawId, _id: invoiceId, amountDue: 0 };
    expect(displayInvoiceNumber(rawId, invoiceId)).toBe("INV-8BJQS7");
    const parsed = parseSearchQuery("INV-8BJQS7", NOW);
    expect(invoiceMatchesQuery(inv, parsed)).toBe(true);
    expect(invoiceSearchLabel({ ...inv, amountDue: 11700 })).toContain(
      "#INV-8BJQS7",
    );
  });

  it("paid gallery invoice paints billed total, not $0 due", () => {
    // QA 194 leftover: #INV-2026-QA1 — $0 PAID while payments $3,600 COMPLETED.
    expect(invoiceSearchLabel(qa1)).toBe("#INV-2026-QA1 — $3,600");
    expect(
      invoiceSearchLabel({
        invoiceNumber: "INV-8BD5QP",
        _id: "draft-due",
        amountDue: 900,
        total: 900,
        currencyCode: "USD",
      }),
    ).toBe("#INV-8BD5QP — $900");
  });

  it("queryInvoices uses invoiceStatusFilter so paid INV-* lookup is not unpaid-only", () => {
    // QA Gallery INV-2026-QA1 is billed. A helper-only assertion still
    // passes if queryInvoices drops invoiceStatusFilter and always skips paid.
    const hash = parseSearchQuery("#INV-2026-QA1", NOW);
    const statuses = invoiceStatusFilter(hash);
    expect(shouldQueryInvoices(hash)).toBe(true);
    expect(statuses).toBeNull();
    expect(keepInvoiceForSearch(qa1, hash, statuses)).toBe(true);

    const unpaid = parseSearchQuery("unpaid invoices", NOW);
    expect(keepInvoiceForSearch(qa1, unpaid, invoiceStatusFilter(unpaid))).toBe(
      false,
    );

    const search = readFileSync("convex/search.ts", "utf8");
    expect(search).toContain("invoiceStatusFilter(parsed)");
    expect(search).toContain("shouldQueryInvoices(parsed)");
    expect(search).toContain("keepInvoiceForSearch(inv, parsed, statuses)");
    expect(search).not.toContain("unpaidStatuses");
    expect(search).not.toContain("if (statuses && !statuses.has");
  });

  it("production build deploys Convex instead of a UI-only vite build", () => {
    // QA 191 leftover: frontend 3dd95bb1 on mule, search still hyphen-split.
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: { build: string; "deploy:production": string };
    };
    expect(pkg.scripts.build).toBe("vite build");
    expect(pkg.scripts["deploy:production"]).toBe(
      "bash scripts/vercel-build.sh",
    );
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      buildCommand: string;
    };
    expect(vercel.buildCommand).toBe("bash scripts/vercel-build.sh");
    const sh = readFileSync("scripts/vercel-build.sh", "utf8");
    const prod =
      sh
        .split('if [ "${VERCEL_ENV:-}" = "production" ]; then')[1]
        ?.split("else")[0] ?? "";
    expect(prod).toContain("convex deploy --cmd 'vite build'");
    expect(prod).not.toMatch(/^\s*vite build\s*$/m);
  });
});
