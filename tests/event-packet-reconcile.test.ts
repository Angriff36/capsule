import { describe, it, expect } from "vitest";
import { reconcile, readiness } from "../src/lib/eventPacket/reconcile";
import { resolveIssue } from "../src/lib/eventPacket/resolveIssue";
import { requiredFacts } from "../src/lib/eventPacket/requirements";
import { validateSnapshot } from "../src/lib/eventPacket/schema";
import type { EventPacketSnapshot, Fact } from "../src/lib/eventPacket/model";
import fixture from "../src/lib/eventPacket/fixtures/liberty-mutual-6837.sources.sanitized.json";
import { recognizeSource } from "../src/lib/eventPacket/recognizeSource";
import {
  groupSources,
  type ExtractedSource,
} from "../src/lib/eventPacket/groupSources";
import { extractObservations } from "../src/lib/eventPacket/extractObservations";
const at = "2026-09-15T00:00:00Z";
function blank(): EventPacketSnapshot {
  return {
    schemaVersion: 1,
    identity: {
      tenantId: "pilot",
      invoiceNumber: "6837",
      eventDate: "2026-09-17",
    },
    artifacts: [],
    observations: [],
    facts: [],
    issues: [],
    resolutions: [],
    checklistVerifications: [],
    revisions: [],
    stage: "draft",
  };
}
function actual() {
  const sources: ExtractedSource[] = fixture.documents.map((d) => {
    const pages = "pages" in d ? d.pages : [];
    const rows =
      "rows" in d && d.rows
        ? d.rows.map((r) => r.cells.map((c) => c.text))
        : undefined;
    return {
      tenantId: "pilot",
      pages: pages ?? [],
      rows,
      artifact: {
        fingerprint: d.sanitizedContentSha256,
        name: d.id,
        mimeType: d.contentType,
        importedAt: at,
        ...recognizeSource({
          text: pages?.map((p) => p.text).join("\n"),
          rows,
        }),
      },
    };
  });
  const g = groupSources(sources);
  return {
    ...blank(),
    artifacts: Array.from(
      new Map(
        sources.map((s) => [s.artifact.fingerprint, s.artifact]),
      ).values(),
    ),
    observations: g.candidates[0].sources.flatMap((s) =>
      extractObservations(s, g.candidates[0].identity),
    ),
  };
}
describe("packet reconciliation", () => {
  it("keeps native access and setup authoritative while blocking source disagreement", async () => {
    for (const fieldKey of ["notes.access", "notes.setup"]) {
      const base = actual();
      const source = base.observations[0];
      const native: Fact = {
        fieldKey,
        value: "Use loading dock A",
        status: "confirmed",
        authority: "native_finalized",
        confidence: 1,
        evidence: [],
      };
      const packet = await reconcile(
        {
          ...base,
          observations: [{ ...source, fieldKey, value: "Use loading dock B" }],
        },
        [native],
      );
      expect(packet.facts.find((f) => f.fieldKey === fieldKey)).toMatchObject({
        value: "Use loading dock A",
        authority: "native_finalized",
      });
      expect(
        packet.issues.find((i) => i.key === "fact." + fieldKey),
      ).toMatchObject({ required: true, status: "open", severity: "blocking" });
    }
  });
  it("limits the dessert conversion action to relevant dessert quantities", async () => {
    const packet = await reconcile(actual());
    const issue = packet.issues.find(
      (i) => i.key === "check.menu.unit-conversion",
    )!;
    expect(issue.message).toMatch(/500 each/i);
    expect(issue.message).toMatch(/250 Each/i);
    expect(issue.message).toMatch(/300 Serving/i);
    expect(issue.message).not.toMatch(/tongs|napkin|lasagna|gallons/i);
    expect(issue.message.length).toBeLessThan(1000);
    expect(issue.evidence.length).toBeGreaterThan(0);
    expect(
      packet.observations.some((o) => String(o.value).includes("Tongs")),
    ).toBe(true);
  });
  it("retains source conflicts, units, production and missing operational checks", async () => {
    const p = await reconcile(actual());
    validateSnapshot(p);
    expect(p.facts.find((f) => f.fieldKey === "guestCount")).toMatchObject({
      status: "confirmed",
      value: 200,
    });
    expect(p.facts.find((f) => f.fieldKey === "serviceStyle")).toMatchObject({
      status: "conflicted",
    });
    expect(p.issues.map((i) => i.key)).toEqual(
      expect.arrayContaining([
        "fact.serviceStyle",
        "check.timeline.load-travel",
        "check.menu.components",
        "check.menu.unit-conversion",
        "check.production.placeholders",
        "check.assignment.vehicle",
        "check.assignment.trailer",
        "check.assignment.crew",
        "check.report.nowsta_event_timesheet",
        "check.report.packlist_item_type",
        "check.report.packlist_category",
        "check.field.buffet-drawing.buffet-applicability",
      ]),
    );
    expect(p.stage).toBe("review");
    expect(p.issues.filter((i) => i.required).length).toBeLessThan(150);
    expect(
      p.issues.find((i) => i.key === "check.timeline.load-travel")?.message,
    ).toMatch(/08:45/);
    expect(
      p.issues.find((i) => i.key === "check.timeline.load-travel")?.message,
    ).toMatch(/15:10/);
    expect(
      p.issues.find((i) => i.key === "check.menu.components")?.message,
    ).toMatch(/250/);
    expect(
      p.issues.find((i) => i.key === "check.menu.unit-conversion")?.message,
    ).toMatch(/500 each/i);
    expect(
      p.issues.find((i) => i.key === "check.production.placeholders")?.message,
    ).toMatch(/MAKE BECHAMEL \*\*\*/);
    expect(readiness(p)).toBe(false);
    expect(
      p.issues.some((i) => i.key.startsWith("check.field.after-event")),
    ).toBe(false);
    expect(await reconcile(p)).toEqual(p);
  });
  it("records supported choice and reopens when a value or unit changes", async () => {
    let p = await reconcile(actual());
    const issue = p.issues.find((i) => i.key === "fact.serviceStyle")!;
    const o = p.observations.find((o) => o.fieldKey === "serviceStyle")!;
    p = await resolveIssue(p, {
      issueId: issue.id,
      choice: o.value,
      observationId: o.id,
      actor: "Manager",
      at,
      reason: "Confirmed with operations",
    });
    expect(
      validateSnapshot(JSON.parse(JSON.stringify(p))).resolutions[0],
    ).toMatchObject({ kind: "fact_choice", observationId: o.id });
    expect(() =>
      validateSnapshot({
        ...p,
        resolutions: p.resolutions.map((r) => ({ ...r, unit: "trays" })),
      }),
    ).toThrow(/observation/);
    expect(p.facts.find((f) => f.fieldKey === "serviceStyle")).toMatchObject({
      status: "confirmed",
      authority: "human_verified",
      value: o.value,
    });
    expect(await reconcile(p)).toEqual(p);
    const changed = {
      ...p,
      observations: p.observations.map((x) =>
        x.id === o.id ? { ...x, value: "Cook Onsite" } : x,
      ),
    };
    expect(
      (await reconcile(changed)).issues.find((i) => i.id === issue.id)?.status,
    ).toBe("open");
    await expect(
      resolveIssue(p, {
        issueId: issue.id,
        choice: "Imaginary",
        actor: "Manager",
        at,
        reason: "x",
      }),
    ).rejects.toThrow();
  });
  it("resolves one-click decisions without a typed reason; firsthand entries still need one", async () => {
    let p = await reconcile(actual());
    const check = p.issues.find((i) => i.key.startsWith("check."))!;
    p = await resolveIssue(p, {
      issueId: check.id,
      choice: "yes",
      answer: "yes",
      actor: "Manager",
      at,
      reason: "",
    });
    expect(
      p.checklistVerifications.find((c) => c.checkKey === check.key)?.reason,
    ).toBe("Verified in review");
    const fact = p.issues.find((i) => !i.key.startsWith("check."))!;
    await expect(
      resolveIssue(p, {
        issueId: fact.id,
        choice: "Made up on the spot",
        kind: "fact_entry",
        actor: "Manager",
        at,
        reason: "",
      }),
    ).rejects.toThrow(/fact entry/i);
  });
  it("preserves native values with explicit disagreement and detects native change", async () => {
    const native: Fact[] = [
      {
        fieldKey: "guestCount",
        value: 201,
        status: "confirmed",
        authority: "native_finalized",
        confidence: 1,
        evidence: [],
      },
    ];
    const p = await reconcile(actual(), native);
    expect(p.facts.find((f) => f.fieldKey === "guestCount")?.value).toBe(201);
    expect(p.issues.find((i) => i.key === "fact.guestCount")?.status).toBe(
      "open",
    );
  });
  it("requires all predeparture checks and both signatures, then invalidates on changed input", async () => {
    const facts: Fact[] = requiredFacts.map((r) => ({
      fieldKey: r.fieldKey,
      value:
        r.fieldKey === "guestCount"
          ? 20
          : r.fieldKey === "invoiceNumber"
            ? "6837"
            : r.fieldKey === "eventDate"
              ? "2026-09-17"
              : "Verified detail",
      status: "confirmed",
      authority: "native_finalized",
      confidence: 1,
      evidence: [],
    }));
    let p = await reconcile(blank(), facts);
    for (const issue of p.issues) {
      p = await resolveIssue(
        p,
        {
          issueId: issue.id,
          choice: "yes",
          answer: "yes",
          actor: "Operations",
          at,
          reason: "Checked actual event and physical assembly",
        },
        facts,
      );
    }
    expect(p.stage).toBe("ready");
    expect(readiness(p)).toBe(true);
    validateSnapshot(p);
    expect(
      p.checklistVerifications.filter((c) => /signature/.test(c.checkKey))
        .length,
    ).toBeGreaterThanOrEqual(2);
    expect(await reconcile(p, facts)).toEqual(p);
    const changed = facts.map((f) =>
      f.fieldKey === "guestCount" ? { ...f, value: 21 } : f,
    );
    const next = await reconcile(p, changed);
    expect(next.stage).toBe("review");
    expect(next.issues.some((i) => i.status === "open")).toBe(true);
  });
  it("rejects unsupported generic resolution and not-applicable signatures", async () => {
    const p = await reconcile(blank());
    const check = p.issues.find((i) => i.key.includes("signature"))!;
    await expect(
      resolveIssue(p, {
        issueId: check.id,
        choice: "yes",
        actor: "",
        at,
        reason: "test",
        answer: "yes",
      }),
    ).rejects.toThrow();
    await expect(
      resolveIssue(p, {
        issueId: check.id,
        choice: "not_applicable",
        actor: "Ops",
        at,
        reason: "test",
        answer: "not_applicable",
      }),
    ).rejects.toThrow();
  });
  it("does not accept a resolved label without recorded checks or menu and timeline facts", async () => {
    const p = await reconcile(blank());
    expect(p.issues.map((i) => i.key)).toEqual(
      expect.arrayContaining([
        "fact.menu.required.name",
        "fact.menu.required.quantity",
        "fact.timeline.event_start.1.time",
        "fact.timeline.event_end.1.time",
      ]),
    );
    expect(
      readiness({
        ...p,
        stage: "ready",
        issues: p.issues.map((i) => ({ ...i, status: "resolved" })),
        facts: requiredFacts.map((r) => ({
          fieldKey: r.fieldKey,
          value: "x",
          status: "confirmed",
          authority: "native_finalized",
          confidence: 1,
          evidence: [],
        })),
      }),
    ).toBe(false);
  });
  it("does not treat unit equality, duplicate evidence or template statements as independent authority", async () => {
    const base = actual();
    const p = await reconcile(base);
    expect(
      p.facts.find((f) => f.fieldKey === "menu.assorted-dessert-bars.quantity")
        ?.status,
    ).toBe("conflicted");
    const observed = base.observations.find(
      (o) => o.fieldKey === "guestCount",
    )!;
    const duplicate = await reconcile({
      ...base,
      observations: [observed, { ...observed, id: "duplicate" }],
    });
    expect(
      duplicate.facts.find((f) => f.fieldKey === "guestCount")?.status,
    ).toBe("candidate");
    const falseSource = await reconcile({
      ...base,
      artifacts: base.artifacts.map((a) => ({ ...a, kind: "training" })),
    });
    expect(
      falseSource.facts.find((f) => f.fieldKey === "guestCount")?.status,
    ).not.toBe("confirmed");
  });
  it("records firsthand missing facts, preserves units and reopens when source evidence arrives", async () => {
    let p = await reconcile(blank());
    p = await resolveIssue(p, {
      issueId: "fact.menu.required.quantity",
      kind: "fact_entry",
      choice: 20,
      unit: "trays",
      actor: "Manager",
      at,
      reason: "Verified directly with the culinary lead",
    });
    expect(
      p.facts.find((f) => f.fieldKey === "menu.required.quantity"),
    ).toMatchObject({
      value: 20,
      unit: "trays",
      authority: "human_verified",
      status: "confirmed",
    });
    expect(
      validateSnapshot(JSON.parse(JSON.stringify(p))).resolutions[0],
    ).toMatchObject({ kind: "fact_entry", unit: "trays" });
    expect(await reconcile(p)).toEqual(p);
    const imported = actual();
    const original = imported.observations[0];
    const changed = await reconcile({
      ...p,
      artifacts: imported.artifacts,
      observations: [
        {
          ...original,
          id: "new-entry",
          fieldKey: "menu.required.quantity",
          value: 25,
          unit: "servings",
        },
      ],
    });
    expect(
      changed.issues.find((i) => i.key === "fact.menu.required.quantity")
        ?.status,
    ).toBe("open");
  });
  it("will not silently accept a source or unit over finalized native facts", async () => {
    const source = actual();
    const obs = source.observations.find(
      (o) => o.fieldKey === "menu.assorted-dessert-bars.quantity",
    )!;
    const native: Fact[] = [
      {
        fieldKey: obs.fieldKey,
        value: obs.value,
        unit: "trays",
        status: "confirmed",
        authority: "native_finalized",
        confidence: 1,
        evidence: [],
      },
    ];
    const p = await reconcile(source, native);
    await expect(
      resolveIssue(
        p,
        {
          issueId: "fact." + obs.fieldKey,
          choice: obs.value,
          observationId: obs.id,
          actor: "Ops",
          at,
          reason: "Confirmed with kitchen",
        },
        native,
      ),
    ).rejects.toThrow(/native/);
    const verified = await resolveIssue(
      p,
      {
        issueId: "fact." + obs.fieldKey,
        choice: obs.value,
        actor: "Ops",
        at,
        reason: "Confirmed current native value",
      },
      native,
    );
    expect(verified.facts.find((f) => f.fieldKey === obs.fieldKey)?.unit).toBe(
      "trays",
    );
    expect(
      verified.issues.find((i) => i.key === "fact." + obs.fieldKey)?.status,
    ).toBe("resolved");
  });
  it("does not churn decisions on reordered observations or metadata and scopes check invalidation", async () => {
    let p = await reconcile(actual());
    p = await resolveIssue(p, {
      issueId: "check.timeline.load-travel",
      choice: "yes",
      answer: "yes",
      actor: "Ops",
      at,
      reason: "Both visits and loading verified with lead",
    });
    const before = p.issues.find((i) => i.id === "check.timeline.load-travel")!;
    const reordered = await reconcile({
      ...p,
      observations: [...p.observations].reverse(),
      artifacts: [...p.artifacts].reverse(),
    });
    expect(reordered.issues.find((i) => i.id === before.id)?.status).toBe(
      "resolved",
    );
    const metadata = await reconcile({
      ...p,
      observations: p.observations.map((o) =>
        o.fieldKey === "source.recordedTime"
          ? { ...o, value: "new print time" }
          : o,
      ),
    });
    expect(metadata.issues.find((i) => i.id === before.id)?.status).toBe(
      "resolved",
    );
    const menuChange = await reconcile({
      ...p,
      observations: p.observations.map((o) =>
        o.fieldKey === "menu.assorted-dessert-bars.quantity"
          ? { ...o, value: 350 }
          : o,
      ),
    });
    expect(menuChange.issues.find((i) => i.id === before.id)?.status).toBe(
      "resolved",
    );
    expect(
      p.issues.some((i) =>
        ["fact.source.recordedTime", "fact.sourceStatus"].includes(i.key),
      ),
    ).toBe(false);
  });
});
