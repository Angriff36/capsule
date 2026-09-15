import { describe, expect, it } from "vitest";
import { validateSnapshot } from "../src/lib/eventPacket/schema";
import {
  identityKey,
  type EventPacketSnapshot,
} from "../src/lib/eventPacket/model";
export function fixture(): EventPacketSnapshot {
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
    stage: "review",
  };
}
describe("canonical packet validation", () => {
  it("round trips a versioned identity", () =>
    expect(identityKey(validateSnapshot(fixture()).identity)).toBe(
      "pilot:6837:2026-09-17",
    ));
  it("rejects unknown versions and malformed data", () => {
    expect(() =>
      validateSnapshot({ ...fixture(), schemaVersion: 2 }),
    ).toThrow();
    expect(() => validateSnapshot({ schemaVersion: 1 })).toThrow();
  });
  it("rejects dangling artifact evidence", () =>
    expect(() =>
      validateSnapshot({
        ...fixture(),
        observations: [
          {
            id: "o",
            fieldKey: "guests",
            value: 200,
            observedAt: "2026-09-15T00:00:00Z",
            evidence: [
              { artifactFingerprint: "a".repeat(64), parserVersion: "1" },
            ],
          },
        ],
      }),
    ).toThrow());
});

it("rejects decisions bound to different evidence and prevents false readiness", () => {
  const packet = fixture();
  packet.issues = [
    {
      id: "i",
      key: "service",
      fieldKey: "service",
      required: true,
      severity: "blocking",
      section: "equipment",
      printSection: "event_brief",
      owner: "manager",
      message: "Review service",
      status: "resolved",
      evidence: [],
      evidenceFingerprint: "a".repeat(64),
    },
  ];
  packet.resolutions = [
    {
      id: "r",
      issueId: "i",
      choice: "Drop Off",
      actor: "manager",
      at: "2026-09-15T00:00:00Z",
      reason: "Checked source",
      evidenceFingerprint: "b".repeat(64),
    },
  ];
  expect(() => validateSnapshot(packet)).toThrow("matching evidence");
  packet.issues[0].status = "open";
  packet.stage = "ready";
  expect(() => validateSnapshot(packet)).toThrow("readiness");
});
it("requires explicit authority for confirmed facts and preserves quantity units", () => {
  const packet = fixture();
  packet.facts = [
    {
      fieldKey: "dessert",
      value: 4,
      unit: "trays",
      status: "confirmed",
      confidence: 1,
      evidence: [],
    },
  ];
  expect(() => validateSnapshot(packet)).toThrow("authority");
  packet.facts[0].status = "candidate";
  expect(validateSnapshot(packet).facts[0].unit).toBe("trays");
});
it("rejects unknown properties, duplicate identities, invalid calendar dates and parser mismatches", () => {
  const packet = fixture();
  expect(() =>
    validateSnapshot({ ...packet, trustedApproval: true }),
  ).toThrow();
  expect(() =>
    validateSnapshot({
      ...packet,
      identity: { ...packet.identity, eventDate: "2026-02-30" },
    }),
  ).toThrow();
  const artifact = {
    fingerprint: "a".repeat(64),
    name: "beo.pdf",
    mimeType: "application/pdf",
    kind: "beo" as const,
    parserVersion: "1",
    recognitionEvidence: [],
    importedAt: "2026-09-15T00:00:00Z",
  };
  packet.artifacts = [artifact, artifact];
  expect(() => validateSnapshot(packet)).toThrow("Duplicate");
  packet.artifacts = [artifact];
  packet.observations = [
    {
      id: "o",
      fieldKey: "guests",
      value: 200,
      observedAt: "2026-09-15T00:00:00Z",
      evidence: [
        { artifactFingerprint: artifact.fingerprint, parserVersion: "2" },
      ],
    },
  ];
  expect(() => validateSnapshot(packet)).toThrow("mismatched");
});

it("preserves raw operational units without equating them", () => {
  const packet = fixture();
  packet.facts = ["pounds", "gallons", "fl oz", "2-inch hotel pans"].map(
    (unit, i) => ({
      fieldKey: "quantity-" + i,
      value: 2,
      unit,
      status: "candidate" as const,
      confidence: 0.5,
      evidence: [],
    }),
  );
  expect(validateSnapshot(packet).facts.map((f) => f.unit)).toEqual([
    "pounds",
    "gallons",
    "fl oz",
    "2-inch hotel pans",
  ]);
});
it("canonicalizes keys by locale-independent code unit order", async () => {
  const { canonicalJson } = await import("../src/lib/eventPacket/model");
  expect(canonicalJson({ ä: 1, z: 2, Z: 3, a: 4 })).toBe(
    '{"Z":3,"a":4,"z":2,"ä":1}',
  );
});
