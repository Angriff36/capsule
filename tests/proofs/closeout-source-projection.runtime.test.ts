/**
 * PL-CLOSEOUT runtime proof (spec §15.3 / §15.5): AC-625 closeout actuals
 * derive from Capsule's own records and a missing source stays open, never a
 * made-up zero; AC-628 the finance read explains every total with the records
 * behind it, the outstanding balance and budget variance; AC-386 plan vs
 * reality per area after the event.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  SOURCE,
  closedOutEvent,
  closeoutRow,
  ensureEncryptionKey,
  harness,
  readSources,
  rolesFor,
  seedSources,
  type SourceLine,
} from "./closeout-sources.runtime.helpers";

beforeAll(ensureEncryptionKey);

const T = "tenant-closeout-sources";
const line = (lines: SourceLine[], key: string) =>
  lines.find((row) => row.key === key)!;
const sum = (row: SourceLine) =>
  Math.round(row.sources.reduce((total, s) => total + s.amount, 0) * 100) / 100;

describe("closeout numbers come from Capsule's records (AC-625, AC-628, AC-386)", () => {
  it("derives every actual from records, shows plan vs actual, and captures them without retyping", async () => {
    const proof = harness();
    const { finance } = rolesFor(proof, T);
    const { eventId, invoiceId } = await closedOutEvent(proof, T, "Sources");
    const seed = await seedSources(proof, T, eventId, invoiceId!);
    expect(seed.invoiceTotal).toBeGreaterThan(0);

    const read = await readSources(finance, eventId);
    const { lines } = read!.projection;

    // AC-625: each actual from its records; every line complete.
    expect(read!.projection.complete).toBe(true);
    expect(line(lines, "revenue").actual).toBe(seed.invoiceTotal);
    expect(line(lines, "ingredient").actual).toBe(SOURCE.foodReceived);
    expect(line(lines, "waste").actual).toBe(SOURCE.waste);
    expect(line(lines, "labor").actual).toBe(SOURCE.labor);
    expect(line(lines, "vendor").actual).toBe(SOURCE.rental);
    expect(line(lines, "commission").actual).toBe(SOURCE.commission);
    expect(line(lines, "headcount").actual).toBe(SOURCE.checkedIn);

    // AC-628: the records behind each money total add up to it, with ids
    // and versions; payments, outstanding balance are explained too.
    for (const key of [
      "revenue",
      "ingredient",
      "waste",
      "vendor",
      "commission",
    ]) {
      expect(sum(line(lines, key))).toBe(line(lines, key).actual);
    }
    expect(line(lines, "ingredient").sources[0]).toMatchObject({
      table: "vendorOrderLines",
      id: seed.ids.orderLine,
      version: 1,
    });
    expect(line(lines, "labor").sources.map((s) => s.id)).toEqual([
      seed.ids.time,
    ]);
    expect(
      line(lines, "headcount")
        .sources.map((s) => s.id)
        .sort(),
    ).toEqual(seed.ids.guests.slice(0, 2).sort());
    expect(read!.projection.payments).toEqual([
      expect.objectContaining({ id: seed.ids.payment, amount: SOURCE.paid }),
    ]);
    expect(read!.projection.collected).toBe(SOURCE.paid);
    expect(read!.projection.outstanding).toBe(seed.invoiceTotal - SOURCE.paid);

    // AC-386: plan vs reality per area.
    expect(line(lines, "revenue").planned).toBe(4500);
    expect(line(lines, "ingredient").planned).toBe(SOURCE.foodOrdered);
    expect(line(lines, "vendor").planned).toBe(SOURCE.rental);
    expect(line(lines, "headcount").planned).toBe(40);

    // Capture takes the record numbers; nothing is typed.
    await proof.executeCommand(
      finance,
      api.closeoutSources.captureCloseoutFromSources,
      { eventId } as never,
    );
    const row = await closeoutRow(finance, eventId);
    const cost =
      SOURCE.foodReceived +
      SOURCE.waste +
      SOURCE.labor +
      SOURCE.rental +
      SOURCE.commission;
    expect(row).toMatchObject({
      status: "draft",
      actualRevenue: seed.invoiceTotal,
      actualIngredientCost: SOURCE.foodReceived,
      actualWasteCost: SOURCE.waste,
      actualLaborCost: SOURCE.labor,
      actualVendorCost: SOURCE.rental + SOURCE.commission,
      totalActualCost: cost,
      grossProfit: seed.invoiceTotal - cost,
      budgetedRevenue: 4500,
      revenueVariance: 4500 - seed.invoiceTotal,
      budgetedCost: 3000,
      costVariance: 3000 - cost,
      expectedHeadcount: 40,
      actualHeadcount: SOURCE.checkedIn,
    });
    const snapshot = JSON.parse(row.sourceSnapshot);
    expect(snapshot.lines.every((l: { entered: boolean }) => !l.entered)).toBe(
      true,
    );
    expect(
      snapshot.lines.find((l: { key: string }) => l.key === "waste").sources,
    ).toEqual([
      {
        table: "wasteRecords",
        id: seed.ids.waste,
        version: 1,
        amount: SOURCE.waste,
      },
    ]);
  });

  it("leaves lines with no records open and only takes typed amounts for those", async () => {
    const proof = harness();
    const { finance } = rolesFor(proof, T);
    const { eventId } = await closedOutEvent(proof, T, "Bare", {
      sendInvoice: false,
    });

    const read = await readSources(finance, eventId);
    const { lines } = read!.projection;
    expect(read!.projection.complete).toBe(false);
    expect(read!.projection.incomplete.sort()).toEqual(
      ["headcount", "ingredient", "labor", "revenue"].sort(),
    );
    for (const key of ["revenue", "ingredient", "labor", "headcount"]) {
      expect(line(lines, key)).toMatchObject({ actual: null, complete: false });
      expect(line(lines, key).note).toBeTruthy();
    }
    // Costs an event may truly not have are a complete zero.
    for (const key of ["waste", "vendor", "commission"]) {
      expect(line(lines, key)).toMatchObject({ actual: 0, complete: true });
    }

    // No made-up zero: capture refuses until the open lines are entered.
    await expect(
      proof.executeCommand(
        finance,
        api.closeoutSources.captureCloseoutFromSources,
        { eventId } as never,
      ),
    ).rejects.toThrow(/Enter revenue/);
    // The closeOut reaction's draft is left as it was.
    const untouched = await closeoutRow(finance, eventId);
    expect(untouched).toMatchObject({ actualRevenue: 0, version: 1 });
    expect(untouched.sourceSnapshot ?? null).toBeNull();

    await proof.executeCommand(
      finance,
      api.closeoutSources.captureCloseoutFromSources,
      {
        eventId,
        entered: { revenue: 4000, ingredient: 700, labor: 600, headcount: 37 },
      } as never,
    );
    const row = await closeoutRow(finance, eventId);
    expect(row).toMatchObject({
      actualRevenue: 4000,
      actualIngredientCost: 700,
      actualLaborCost: 600,
      actualWasteCost: 0,
      actualVendorCost: 0,
      totalActualCost: 1300,
      grossProfit: 2700,
      actualHeadcount: 37,
    });
    const entered = JSON.parse(row.sourceSnapshot)
      .lines.filter((l: { entered: boolean }) => l.entered)
      .map((l: { key: string }) => l.key)
      .sort();
    expect(entered).toEqual(["headcount", "ingredient", "labor", "revenue"]);
  });

  it("takes the guest count and leftovers from the signed food waste form", async () => {
    const proof = harness();
    const { finance } = rolesFor(proof, T);
    const { eventId } = await closedOutEvent(proof, T, "Food waste", {
      sendInvoice: false,
    });
    const muda = (attendance: number) =>
      JSON.stringify({
        kind: "muda",
        muda: {
          attendance,
          staffError: false,
          staffErrorNote: "",
          appetizersUsed: false,
          appetizerStyles: [],
          mainsHandling: "to_kitchen",
          leftovers: [{ item: "Pulled Pork", kind: "main", amount: 6 }],
        },
      });
    const formIds = (await finance.run(async (ctx) => {
      const db = ctx.db as any;
      const form = {
        tenantId: T,
        version: 3,
        eventId,
        formKey: "field.muda",
        label: "Food waste count",
        needsTwoPeople: false,
        evidence: "note",
      };
      // The menu's Pulled Pork: 6 oz of pork a plate at $4 a pound = $1.50.
      const base = { tenantId: T, version: 1, createdAt: 1, updatedAt: 1 };
      const pork = await db.insert("ingredients", {
        ...base,
        name: "Pork shoulder",
        unit: "pound",
        costPerUnit: 4,
        status: "active",
      });
      const dish = await db.insert("dishes", {
        ...base,
        name: "Pulled Pork",
        category: "Mains",
        portionSize: 6,
        portionUnit: "ounce",
        status: "active",
      });
      await db.insert("dishIngredients", {
        ...base,
        dishId: dish,
        ingredientId: pork,
        quantity: 6,
        unit: "ounce",
        sortOrder: 1,
        addedAt: 1,
      });
      await db.insert("eventDishes", {
        ...base,
        eventId,
        dishId: dish,
        course: "main",
        quantityServings: 40,
      });
      return {
        done: await db.insert("fieldConfirmations", {
          ...form,
          status: "done",
          completedAt: 1000,
          answers: muda(33),
        }),
        // Not signed yet: never counts.
        open: await db.insert("fieldConfirmations", {
          ...form,
          status: "open",
          answers: muda(99),
        }),
      };
    })) as { done: string; open: string };

    const { lines } = (await readSources(finance, eventId))!.projection;
    expect(line(lines, "headcount")).toMatchObject({
      actual: 33,
      complete: true,
      note: "Counted on the food waste form",
    });
    expect(line(lines, "headcount").sources).toEqual([
      expect.objectContaining({
        table: "fieldConfirmations",
        id: formIds.done,
      }),
    ]);
    expect(line(lines, "waste").actual).toBe(0);
    expect(line(lines, "waste").note).toBe(
      "About $24.00 of food left over (already in the food cost)",
    );
    expect(line(lines, "waste").sources).toEqual([
      expect.objectContaining({
        table: "fieldConfirmations",
        id: formIds.done,
        amount: 0,
        // 6 lb = 96 oz = 16 plates x $1.50, shown but not added (the pork
        // is already in the food cost).
        label:
          "Left over: Pulled Pork 6 lb (about $24.00) · brought to kitchen · about $24.00 of food made and not eaten (already in the food cost)",
      }),
    ]);

    await proof.executeCommand(
      finance,
      api.closeoutSources.captureCloseoutFromSources,
      {
        eventId,
        entered: { revenue: 4000, ingredient: 700, labor: 600 },
      } as never,
    );
    expect(await closeoutRow(finance, eventId)).toMatchObject({
      actualHeadcount: 33,
      actualWasteCost: 0,
    });
  });

  it("gives the numbers only to finance and event managers of the same company", async () => {
    const proof = harness();
    const { eventId, invoiceId } = await closedOutEvent(proof, T, "Access");
    await seedSources(proof, T, eventId, invoiceId!);
    const kitchen = proof.asRole({
      subject: "kitchen-sources",
      role: "kitchen_staff",
      tenantId: T,
    });
    const outsider = proof.asRole({
      subject: "finance-other",
      role: "finance_manager",
      tenantId: "tenant-closeout-sources-other",
    });
    const events = rolesFor(proof, T).events;
    expect(await readSources(kitchen, eventId)).toBeNull();
    expect(await readSources(outsider, eventId)).toBeNull();
    // Revenue, ingredients, waste, labor, vendors, commission, transport
    // (ee2d6374) and headcount.
    expect(
      (await readSources(events, eventId))!.projection.lines.map((l) => l.key),
    ).toEqual([
      "revenue",
      "ingredient",
      "waste",
      "labor",
      "vendor",
      "commission",
      "transport",
      "headcount",
    ]);
    await expect(
      proof.executeCommand(
        outsider,
        api.closeoutSources.captureCloseoutFromSources,
        { eventId } as never,
      ),
    ).rejects.toThrow(/can't close out this event/);
  });
});
