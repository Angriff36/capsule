/**
 * Runtime proof (PL-ROUTE-STATES, AC-054 sweep task "staff email summaries").
 *
 * - Only people who saved a choice get email; each gets only the summaries
 *   they turned on, only when there is something to tell, and only what their
 *   role may see (invoices: finance and managers; stock: kitchen, stock and
 *   managers; shifts: their own).
 * - A second run the same day sends nothing again.
 * - With email not set up, nothing is sent and the next morning stays booked.
 * - Turning a summary on books the daily run once.
 */
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { nextMorningRun } from "../../convex/lib/staffSummaryContent";

const TENANT = "tenant-staff-summaries";
const NOW = Date.UTC(2026, 9, 5, 12, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("RESEND_API_KEY", "re_test_proof");
  vi.stubEnv("INVOICE_REMINDER_FROM_EMAIL", "team@proof.example");
  vi.stubEnv("CAPSULE_PUBLIC_APP_URL", "https://app.proof.example");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubEmail() {
  const sent: Array<{ to: string[]; subject: string; text: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body?: string } = {}) => {
      sent.push(JSON.parse(String(init.body)));
      return Response.json({ id: `email_${sent.length}` });
    }),
  );
  return sent;
}

const base = { tenantId: TENANT, version: 1, createdAt: NOW, updatedAt: NOW };

async function seed() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const person = (
      subject: string,
      email: string,
      role: "kitchen_staff" | "finance_manager" | "staff",
    ) =>
      ctx.db.insert("people", {
        ...base,
        givenName: subject,
        familyName: "Proof",
        email,
        role,
        authSubjectId: subject,
        employmentType: "full_time",
        status: "active",
      });
    const cook = await person("cook", "cook@proof.example", "kitchen_staff");
    await person("money", "money@proof.example", "finance_manager");
    await person("quiet", "quiet@proof.example", "staff");
    const subscribe = (ownerId: string, on: boolean) =>
      ctx.db.insert("emailNotificationSubscriptions", {
        ...base,
        ownerId,
        eventUpdates: on,
        invoiceReminders: on,
        lowStockAlerts: on,
        shiftChanges: on,
        configuredAt: NOW - 1000,
      });
    await subscribe("cook", true);
    await subscribe("money", true);
    // "quiet" saved nothing: no row, no email.

    const eventId = await ctx.db.insert("events", {
      ...base,
      title: "Rivera dinner",
      eventType: "dinner",
      stage: "approved",
      startsAt: NOW + 3 * 86_400_000,
      updatedAt: NOW - 3_600_000,
    });
    await ctx.db.insert("events", {
      ...base,
      title: "Old party",
      eventType: "party",
      stage: "completed",
      updatedAt: NOW - 3 * 86_400_000,
    });
    const clientId = await ctx.db.insert("clients", {
      ...base,
      clientType: "company",
      companyName: "Garden Club",
      taxExempt: false,
      paymentTermsDays: 14,
      status: "active",
    });
    await ctx.db.insert("invoices", {
      ...base,
      clientId,
      invoiceNumber: "INV-9",
      subtotal: 500,
      taxAmount: 0,
      discountAmount: 0,
      total: 500,
      amountPaid: 0,
      amountDue: 500,
      paymentTermsDays: 14,
      status: "sent",
      dueDate: NOW - 86_400_000,
    });
    const ingredientId = await ctx.db.insert("ingredients", {
      ...base,
      name: "Butter",
      unit: "pound",
      costPerUnit: 4,
      status: "active",
    });
    const locationId = await ctx.db.insert("storageLocations", {
      ...base,
      name: "Walk-in",
      status: "active",
    });
    await ctx.db.insert("inventoryItems", {
      ...base,
      ingredientId,
      locationId,
      quantityOnHand: 2,
      unit: "pound",
      parLevel: 10,
      reorderThreshold: 4,
      unitCost: 4,
    });
    await ctx.db.insert("shifts", {
      ...base,
      personId: cook,
      eventId,
      startsAt: NOW + 2 * 86_400_000,
      role: "Line cook",
      status: "scheduled",
      updatedAt: NOW - 600_000,
    });
  });
  return t;
}

describe("staff email summaries", () => {
  it("sends each person only what they turned on and may see, once a day", async () => {
    const t = await seed();
    const sent = stubEmail();
    const first = await t.action(internal.staffSummaries.runTenant, {
      tenantId: TENANT,
    });

    const by = (to: string) =>
      sent
        .filter((mail) => mail.to[0] === to)
        .map((mail) => mail.subject)
        .sort();
    // Cook: events, stock, own shift; never invoices.
    expect(by("cook@proof.example")).toEqual([
      expect.stringMatching(/1 event changed since yesterday/),
      expect.stringMatching(/1 item is at or below the reorder level/),
      expect.stringMatching(/1 of your shifts changed/),
    ]);
    // Finance manager: events, invoices, stock; no shifts of their own.
    expect(by("money@proof.example")).toEqual([
      expect.stringMatching(/1 event changed since yesterday/),
      expect.stringMatching(/1 invoice is past due/),
      expect.stringMatching(/1 item is at or below the reorder level/),
    ]);
    expect(by("quiet@proof.example")).toEqual([]);
    expect(first).toEqual({ sent: 6, failed: 0 });
    const butter = sent.find((mail) => /reorder/.test(mail.subject));
    expect(butter?.text).toContain("Butter: 2 pound left");
    expect(sent.some((mail) => /Old party/.test(mail.text))).toBe(false);

    const again = await t.action(internal.staffSummaries.runTenant, {
      tenantId: TENANT,
    });
    expect(again).toEqual({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(6);
  });

  it("sends nothing when email is not set up and keeps the next morning booked", async () => {
    const t = await seed();
    vi.stubEnv("RESEND_API_KEY", "");
    const sent = stubEmail();
    const result = await t.action(internal.staffSummaries.runTenant, {
      tenantId: TENANT,
    });
    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(0);
    const cook = t.withIdentity({
      subject: "cook",
      org_id: TENANT,
      role: "kitchen_staff",
    });
    const status = await cook.query(api.staffSummaries.status, {});
    expect(status.emailReady).toBe(false);
    expect(status.nextRunAt).toBe(nextMorningRun(NOW, null));
  });

  it("books the daily run once when someone turns a summary on", async () => {
    const t = await seed();
    const cook = t.withIdentity({
      subject: "cook",
      org_id: TENANT,
      role: "kitchen_staff",
    });
    const first = await cook.mutation(api.staffSummaries.ensureBooked, {});
    const second = await cook.mutation(api.staffSummaries.ensureBooked, {});
    expect(second.nextRunAt).toBe(first.nextRunAt);
    expect(first.nextRunAt).toBeGreaterThan(NOW);
    const bookings = await t.run(async (ctx) =>
      (await ctx.db.query("manifestEvents").collect()).filter(
        (row) => row.type === "StaffSummariesBooked",
      ),
    );
    expect(bookings).toHaveLength(1);
  });
});
