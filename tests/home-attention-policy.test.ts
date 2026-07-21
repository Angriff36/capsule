import { describe, expect, it } from "vitest";
import { HomeAttentionPolicy } from "../src/features/home/HomeAttentionPolicy";

const policy = new HomeAttentionPolicy();
const now = Date.parse("2026-07-20T12:00:00.000Z");

describe("HomeAttentionPolicy", () => {
  it("omits zero-count lanes and never invents KPIs", () => {
    const desk = policy.build({
      role: "kitchen_staff",
      nowMs: now,
      events: [],
      invoices: [{ status: "paid", deletedAt: null }],
      prepTasks: [],
      packLists: [],
      closeouts: [],
    });
    expect(desk.attention).toEqual([]);
    expect(desk.upcoming).toEqual([]);
  });

  it("role-orders attention when multiple lanes have work", () => {
    const desk = policy.build({
      role: "finance_staff",
      nowMs: now,
      events: [
        {
          _id: "e1",
          title: "Gala",
          stage: "approved",
          startsAt: now + 86_400_000,
          deletedAt: null,
        },
      ],
      invoices: [
        { status: "sent", deletedAt: null },
        { status: "overdue", deletedAt: null },
      ],
      prepTasks: [{ status: "open", deletedAt: null }],
      packLists: [],
      closeouts: [{ status: "draft", deletedAt: null }],
    });

    expect(desk.attention.map((item) => item.id)).toEqual([
      "open_invoices",
      "draft_closeouts",
      "services_this_week",
      "open_prep",
    ]);
    expect(desk.attention[0]?.count).toBe(2);
  });

  it("lists upcoming services with verified pack readiness", () => {
    const desk = policy.build({
      role: "event_manager",
      nowMs: now,
      events: [
        {
          _id: "e1",
          title: "Dinner",
          stage: "executing",
          startsAt: now + 3_600_000,
          deletedAt: null,
        },
        {
          _id: "e2",
          title: "Cancelled",
          stage: "cancelled",
          startsAt: now + 86_400_000,
          deletedAt: null,
        },
      ],
      invoices: undefined,
      prepTasks: undefined,
      packLists: [
        { eventId: "e1", status: "packing", deletedAt: null },
        { eventId: "e1", status: "cancelled", deletedAt: null },
      ],
      closeouts: undefined,
    });

    expect(desk.upcoming).toHaveLength(1);
    expect(desk.upcoming[0]?.title).toBe("Dinner");
    expect(desk.upcoming[0]?.readiness).toEqual(
      expect.arrayContaining(["1 open pack list", "Stage executing"]),
    );
  });

  it("ignores soft-deleted rows", () => {
    const desk = policy.build({
      role: "admin",
      nowMs: now,
      events: [
        {
          _id: "gone",
          title: "Gone",
          stage: "approved",
          startsAt: now + 86_400_000,
          deletedAt: now - 1,
        },
      ],
      invoices: [{ status: "sent", deletedAt: now - 1 }],
      prepTasks: [{ status: "open", deletedAt: now - 1 }],
      packLists: [{ status: "draft", deletedAt: now - 1 }],
      closeouts: [{ status: "draft", deletedAt: now - 1 }],
    });
    expect(desk.attention).toEqual([]);
    expect(desk.upcoming).toEqual([]);
  });
});
