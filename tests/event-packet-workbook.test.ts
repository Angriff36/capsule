import { describe, expect, it } from "vitest";
import { buildWorkbook } from "../src/lib/eventPacket/buildWorkbook";
import { renderWorkbook } from "../src/lib/eventPacket/renderWorkbook";
import type { EventPacketSnapshot } from "../src/lib/eventPacket/model";
const blank = (): EventPacketSnapshot => ({
  schemaVersion: 1,
  identity: {
    tenantId: "test",
    invoiceNumber: "6837",
    eventDate: "2026-09-17",
  },
  artifacts: [],
  facts: [],
  observations: [],
  issues: [],
  resolutions: [],
  checklistVerifications: [],
  revisions: [],
  stage: "ready",
});
describe("measured operational workbook", () => {
  it("does not trust a forged ready stage and retains all 12 field forms", () => {
    const w = buildWorkbook(blank());
    expect(w.status).toBe("NEEDS ATTENTION");
    expect(w.sections.filter((s) => s.id.startsWith("field."))).toHaveLength(
      12,
    );
    expect(w.completeness.formPages).toBe(18);
  });
  it("embeds the original Event Forms One Print pages verbatim and overlays only event data", () => {
    const w = buildWorkbook(blank());
    const pages: Record<string, number> = {};
    for (const s of w.sections.filter((s) => s.id.startsWith("field."))) {
      const sp = s.blocks.find((b) => b.kind === "sourcePage")?.sourcePage;
      expect(sp?.file).toBe("event-forms-one-print");
      pages[s.id] = sp!.page;
    }
    expect(pages).toEqual({
      "field.task": 1,
      "field.leaving-shop": 2,
      "field.arrival": 3,
      "field.muda": 4,
      "field.bins": 5,
      "field.after-event": 6,
      "field.return": 7,
      "field.packing": 8,
      "field.buffet-drawing": 9,
      "field.leaving-event": 10,
      "field.takeoff-documents": 11,
      "field.takeoff-readiness": 12,
    });
    // Field-use pages carry only the event number/date overlay; no action
    // numbers, banners or recreated form text.
    for (const s of w.sections.filter((s) => s.id.startsWith("field."))) {
      expect(s.blocks).toHaveLength(1);
      const sp = s.blocks[0].sourcePage!;
      expect(
        sp.overlays.filter((o) => o.kind === "yn" || o.kind === "choice"),
      ).toHaveLength(s.id === "field.task" ? sp.overlays.length - 2 : 0);
    }
  });
  it("pre-fills known data and keeps truly unknown fields blank, not NEEDS REVIEW", () => {
    const s = blank();
    s.observations = [
      {
        id: "a",
        fieldKey: "menu.corn.quantity",
        value: 30,
        unit: "Each",
        evidence: [],
        observedAt: "2026-09-15T00:00:00Z",
      },
    ];
    const w = buildWorkbook(s);
    const text = JSON.stringify(w);
    expect(text).toContain("30 Each");
    expect(text).not.toContain("NEEDS REVIEW: not verified");
  });
  it("prints only confirmed facts and explicitly labels candidate observations", () => {
    const s = blank();
    s.facts = [
      {
        fieldKey: "serviceStyle",
        status: "conflicted",
        confidence: 0,
        evidence: [],
      },
    ];
    s.observations = [
      {
        id: "a",
        fieldKey: "serviceStyle",
        value: "Drop Off",
        evidence: [],
        observedAt: "2026-09-15T00:00:00Z",
      },
      {
        id: "b",
        fieldKey: "serviceStyle",
        value: "Bring Hot",
        evidence: [],
        observedAt: "2026-09-15T00:00:00Z",
      },
    ];
    const w = buildWorkbook(s);
    const text = JSON.stringify(w);
    expect(text).toContain("NEEDS REVIEW");
    expect(text).toContain("Drop Off");
    expect(text).toContain("Bring Hot");
  });
  it("repeats all required issues on the cover and affected section with owner and evidence", () => {
    const s = blank();
    s.issues = [
      {
        id: "x",
        key: "test",
        fieldKey: "menu.dessert.quantity",
        required: true,
        severity: "blocking",
        section: "menu",
        printSection: "menu",
        owner: "Culinary",
        message: "Resolve dessert quantity",
        status: "open",
        evidence: [],
        evidenceFingerprint: "x",
      },
    ];
    const w = buildWorkbook(s);
    for (const id of ["cover", "menu"]) {
      expect(JSON.stringify(w.sections.find((s) => s.id === id))).toContain(
        "Resolve dessert quantity",
      );
      expect(JSON.stringify(w.sections.find((s) => s.id === id))).toContain(
        "Culinary",
      );
    }
  });
  it("renders every page within measured bounds without overlaps or unsupported glyphs", async () => {
    const w = buildWorkbook(blank());
    const r = await renderWorkbook(w);
    expect(r.bytes.slice(0, 4)).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(r.audit.violations).toEqual([]);
    expect(r.audit.unmatchedOverlays).toEqual([]);
    expect(r.audit.pageCount).toBeGreaterThanOrEqual(17);
    expect(r.audit.pageCount).toBeLessThan(55);
    // All 12 original form pages are present in the merged binder.
    expect(r.audit.mergedPageCount).toBe(r.audit.pageCount + 12);
  });
});
import { reconcile } from "../src/lib/eventPacket/reconcile";
import { resolveIssue } from "../src/lib/eventPacket/resolveIssue";
import { requiredFacts } from "../src/lib/eventPacket/requirements";
import { recognizeSource } from "../src/lib/eventPacket/recognizeSource";
import {
  groupSources,
  type ExtractedSource,
} from "../src/lib/eventPacket/groupSources";
import { extractObservations } from "../src/lib/eventPacket/extractObservations";
import fixture from "../src/lib/eventPacket/fixtures/liberty-mutual-6837.sources.sanitized.json";
import type { Fact } from "../src/lib/eventPacket/model";
it("renders READY only after clean facts, all checks and both recorded signoffs", async () => {
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
  let s = await reconcile(blank(), facts);
  for (const issue of s.issues)
    s = await resolveIssue(
      s,
      {
        issueId: issue.id,
        choice: "yes",
        answer: "yes",
        actor: "Operations",
        at: "2026-09-15T00:00:00Z",
        reason: "Checked actual event and physical assembly",
      },
      facts,
    );
  const w = buildWorkbook(s);
  expect(w.status).toBe("READY");
  const r = await renderWorkbook(w);
  expect(r.audit.violations).toEqual([]);
  const field = JSON.stringify(
    w.sections.filter((s) => s.id.startsWith("field.")),
  );
  expect(field).not.toContain("Recorded verifications");
  // Field forms are the original pages; the signatures stay on the source
  // page, not in recreated workbook text.
  const takeoff = w.sections.filter((s) => s.id.startsWith("field.takeoff"));
  for (const s of takeoff) expect(s.blocks[0].kind).toBe("sourcePage");
}, 60000);
it("retains eight packing items, original production units, both visits and source form text", async () => {
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
        importedAt: "2026-09-15T00:00:00Z",
        ...recognizeSource({
          text: pages?.map((p) => p.text).join("\n"),
          rows,
        }),
      },
    };
  });
  const g = groupSources(sources);
  const s = await reconcile({
    ...blank(),
    artifacts: sources.map((s) => s.artifact),
    observations: g.candidates[0].sources.flatMap((s) =>
      extractObservations(s, g.candidates[0].identity),
    ),
  });
  const w = buildWorkbook(s);
  expect(w.status).toBe("NEEDS ATTENTION");
  expect(w.completeness.packItems).toBe(8);
  const text = JSON.stringify(w);
  for (const v of [
    "15:10",
    "15:15",
    "6.25",
    "gallons",
    "MAKE BECHAMEL",
    "Drop Off",
    "Bring Hot",
    "250",
    "300",
    "500",
  ])
    expect(text).toContain(v);
  // Field-execution form wording lives on the original pages, not in the
  // recreated workbook text.
  expect(text).not.toContain("PURPLE");
  expect(text).not.toContain("physically returned");
  expect(text).not.toContain("Cambros");
  expect(text).not.toContain("0-25 (XS)");
  // Packlist rows print their real source quantities, not NEEDS REVIEW.
  expect(text).not.toContain("Quantity: NEEDS REVIEW: not verified");
  const cover = w.sections[0].blocks.map((b) => b.text).join("\n");
  const issues = s.issues.filter((i) => i.required && i.status === "open");
  expect(w.sections[0].blocks.filter((b) => b.kind === "issue")).toHaveLength(
    issues.length,
  );
  for (const n of issues.keys()) expect(cover).toContain(`#${n + 1} `);
  for (const owner of new Set(issues.map((i) => i.owner)))
    expect(cover).toContain(
      owner
        .replace("Operations / source owner", "Ops/source owner")
        .replace("Operations reviewer", "Ops reviewer"),
    );
  const r = await renderWorkbook(w);
  expect(r.audit.violations).toEqual([]);
}, 60000);
it("omits an old checklist approval after changed guest count reopens the check", async () => {
  const facts: Fact[] = [
    {
      fieldKey: "guestCount",
      value: 20,
      status: "confirmed",
      authority: "native_finalized",
      confidence: 1,
      evidence: [],
    },
  ];
  let p = await reconcile(blank(), facts);
  const check = p.issues.find(
    (i) => i.key === "check.final-lock.info.verify-guest-count",
  )!;
  p = await resolveIssue(
    p,
    {
      issueId: check.id,
      choice: "yes",
      answer: "yes",
      actor: "Verifier",
      at: "2026-09-15T10:00:00Z",
      reason: "Unique old guest-count approval",
    },
    facts,
  );
  expect(
    JSON.stringify(
      buildWorkbook(p).sections.find((s) => s.id === "final-lock"),
    ),
  ).toContain("Unique old guest-count approval");
  const changed = await reconcile(
    p,
    facts.map((f) => ({ ...f, value: 21 })),
  );
  expect(changed.issues.find((i) => i.id === check.id)?.status).toBe("open");
  expect(
    changed.checklistVerifications.some(
      (v) => v.reason === "Unique old guest-count approval",
    ),
  ).toBe(true);
  expect(
    JSON.stringify(
      buildWorkbook(changed).sections.find((s) => s.id === "final-lock"),
    ),
  ).not.toContain("Unique old guest-count approval");
  const orphaned = { ...p, resolutions: [] };
  expect(
    JSON.stringify(
      buildWorkbook(orphaned).sections.find((s) => s.id === "final-lock"),
    ),
  ).not.toContain("Unique old guest-count approval");
});
it("prints crew and trailer facts plus only current assignment verification details", async () => {
  const facts: Fact[] = [
    ["guestCount", 20],
    ["crew.lead", "Alex Crewlead"],
    ["staffing.assistant", "Robin Assistant"],
    ["vehicle.assignment", "Van 17"],
    ["trailer.assignment", "Trailer 4"],
  ].map(([fieldKey, value]) => ({
    fieldKey: String(fieldKey),
    value,
    status: "confirmed",
    authority: "native_finalized",
    confidence: 1,
    evidence: [],
  }));
  let p = await reconcile(blank(), facts);
  for (const kind of ["crew", "vehicle", "trailer"]) {
    const check = p.issues.find((i) => i.key === "check.assignment." + kind)!;
    p = await resolveIssue(
      p,
      {
        issueId: check.id,
        choice: "yes",
        answer: "yes",
        actor: "Dispatch Manager",
        at: "2026-09-15T10:00:00Z",
        reason: `Confirmed ${kind} assignment detail`,
      },
      facts,
    );
  }
  const w = buildWorkbook(p);
  const staffing = JSON.stringify(w.sections.find((s) => s.id === "staffing"));
  const vehicles = JSON.stringify(w.sections.find((s) => s.id === "vehicles"));
  for (const value of [
    "Alex Crewlead",
    "Robin Assistant",
    "Confirmed crew assignment detail",
    "Dispatch Manager",
    "2026-09-15T10:00:00Z",
  ])
    expect(staffing).toContain(value);
  for (const value of [
    "Van 17",
    "Trailer 4",
    "Confirmed vehicle assignment detail",
    "Confirmed trailer assignment detail",
    "Dispatch Manager",
    "2026-09-15T10:00:00Z",
  ])
    expect(vehicles).toContain(value);
  const changed = await reconcile(
    p,
    facts.map((f) => (f.fieldKey === "guestCount" ? { ...f, value: 21 } : f)),
  );
  const next = JSON.stringify(
    buildWorkbook(changed).sections.filter((s) =>
      ["staffing", "vehicles"].includes(s.id),
    ),
  );
  for (const kind of ["crew", "vehicle", "trailer"])
    expect(next).not.toContain(`Confirmed ${kind} assignment detail`);
});
