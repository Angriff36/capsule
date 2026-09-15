import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

async function fixture() {
  const t = convexTest(schema, modules);
  const eventId = await t.run(async (ctx) => {
    const clientId = await ctx.db.insert("clients", {
      tenantId: "briefing-tenant",
      clientType: "company",
      companyName: "Client",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      version: 1,
      deletedAt: null,
    });
    return ctx.db.insert("events", {
      tenantId: "briefing-tenant",
      clientId,
      title: "Packet event",
      eventType: "Lunch",
      startsAt: Date.parse("2026-09-17T17:00:00Z"),
      endsAt: Date.parse("2026-09-17T18:00:00Z"),
      expectedHeadcount: 200,
      budgetAmount: 12345,
      quotedPrice: 67890,
      operationalRequirements: "PRIVATE SOURCE MONEY APPROVAL HR",
      stage: "planning",
      version: 1,
      deletedAt: null,
    });
  });
  return { t, eventId };
}
describe("crew packet briefing boundary", () => {
  it("returns exactly the narrow current readiness projection to crew", async () => {
    const { t, eventId } = await fixture();
    const crew = t.withIdentity({
      subject: "crew",
      org_id: "briefing-tenant",
      role: "staff",
    });
    const briefing = await crew.query(anyApi.eventDayBriefing.getBriefing, {
      eventId,
    });
    expect(briefing).not.toBeNull();
    const packet = briefing.packetReadiness;
    expect(Object.keys(packet).sort()).toEqual([
      "finalSignoffsComplete",
      "ready",
      "requiredOpenIssueCount",
      "sections",
    ]);
    expect(packet.ready).toBe(false);
    expect(packet.finalSignoffsComplete).toBe(false);
    expect(packet.sections.map((row: any) => row.section).sort()).toEqual([
      "contacts",
      "equipment",
      "layouts",
      "menu",
      "packlist",
      "staffing",
      "timeline",
      "vehicles",
      "venue",
    ]);
    for (const section of packet.sections)
      expect(Object.keys(section).sort()).toEqual([
        "openIssueCount",
        "section",
        "status",
        "urgentAction",
      ]);
    expect(JSON.stringify(briefing)).not.toContain(
      "PRIVATE SOURCE MONEY APPROVAL HR",
    );
    for (const secret of [
      "snapshot",
      "resolutions",
      "checklistVerifications",
      "artifacts",
      "evidence",
      "pdfBytes",
      "storageId",
      "budgetAmount",
      "quotedPrice",
      "hourlyRate",
    ])
      expect(packet).not.toHaveProperty(secret);
    expect(briefing.event).not.toHaveProperty("budgetAmount");
    expect(briefing.event).not.toHaveProperty("quotedPrice");
  });
  it("does not reveal another tenant's event or packet state", async () => {
    const { t, eventId } = await fixture();
    expect(
      await t
        .withIdentity({
          subject: "other",
          org_id: "another-tenant",
          role: "admin",
        })
        .query(anyApi.eventDayBriefing.getBriefing, { eventId }),
    ).toBeNull();
    expect(
      await t.query(anyApi.eventDayBriefing.getBriefing, { eventId }),
    ).toBeNull();
  });
});
