import { describe, expect, it } from "vitest";
import { loadEventBundle } from "../src/lib/tppReports/loadEventBundle";
import { loadEventBundleFromText } from "../src/lib/tppReports/loadEventBundleFromText";
import fixture from "../src/lib/eventPacket/fixtures/liberty-mutual-6837.snapshot.json";
import {
  parsePacketSnapshot,
  parsePortablePacket,
  verifyPacketArtifacts,
} from "../src/lib/eventPacket/packetContract";
import { canonicalJson, fingerprintBytes } from "../src/lib/eventPacket/model";
import { reconcile, readiness } from "../src/lib/eventPacket/reconcile";
const snapshot = {
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
describe("packet evidence import contract", () => {
  it("preserves the pilot schema1 invoice6837 snapshot and exact issue outcomes", async () => {
    const parsed = parsePacketSnapshot(JSON.stringify(fixture));
    expect(canonicalJson(parsed)).toBe(canonicalJson(fixture));
    expect(canonicalJson(await reconcile(parsed))).toBe(canonicalJson(parsed));
    expect(parsed.identity).toEqual(snapshot.identity);
    expect(parsed.stage).toBe("review");
    expect(parsed.resolutions).toEqual([]);
    expect(
      parsed.observations
        .filter((o) => o.fieldKey === "serviceStyle")
        .map((o) => o.value),
    ).toEqual(expect.arrayContaining(["Drop Off", "Bring Hot"]));
    expect(parsed.issues.some((i) => i.required && i.status === "open")).toBe(
      true,
    );
    expect(
      parsed.observations.some((o) =>
        o.evidence.some((e) => e.page || e.row || e.cell),
      ),
    ).toBe(true);
    expect(readiness(parsed)).toEqual(readiness(await reconcile(parsed)));
  });

  it("rejects unknown versions and dangling or mismatched evidence fingerprints", () => {
    expect(() =>
      parsePacketSnapshot({ ...snapshot, schemaVersion: 2 }),
    ).toThrow();
    const changed = structuredClone(fixture);
    changed.observations[0].evidence[0].artifactFingerprint = "f".repeat(64);
    expect(() => parsePacketSnapshot(changed)).toThrow("artifact evidence");
    const parserMismatch = structuredClone(fixture);
    parserMismatch.observations[0].evidence[0].parserVersion = "unmatched";
    expect(() => parsePacketSnapshot(parserMismatch)).toThrow(
      "artifact evidence",
    );
  });

  it("deduplicates repeated packet evidence while retaining all exact observations", () => {
    const text = JSON.stringify(fixture);
    const loaded = loadEventBundleFromText({
      packetFiles: [
        { name: "one.json", text },
        { name: "again.json", text },
      ],
    });
    expect(loaded.bundle.sources).toEqual(["eventPacket"]);
    expect(loaded.bundle.packetEvidence?.snapshots).toEqual([fixture]);
    expect(loaded.bundle.packetEvidence?.artifacts).toEqual(fixture.artifacts);
    expect(loaded.bundle.packetEvidence?.observations).toEqual(
      fixture.observations,
    );
    expect(loaded.bundle.header).toEqual({});
    expect(loaded.bundle.staff).toEqual([]);
    expect(loaded.bundle.warnings).toContainEqual(
      expect.stringContaining("unverified evidence"),
    );
  });

  it("retains imported claimed authority only in the evidence archive", () => {
    const input = {
      ...snapshot,
      facts: [
        {
          fieldKey: "serviceStyle",
          value: "Bring Hot",
          status: "confirmed",
          authority: "native_finalized",
          confidence: 1,
          evidence: [],
        },
      ],
    };
    const loaded = loadEventBundle([
      { name: "anything.txt", contents: Buffer.from(JSON.stringify(input)) },
    ]);
    expect(loaded.bundle.header.serviceStyle).toBeUndefined();
    expect(loaded.bundle.packetEvidence?.snapshots[0].facts).toEqual(
      input.facts,
    );
  });

  it("verifies portable source bytes and rejects corruption, missing and extra blobs", async () => {
    const bytes = new TextEncoder().encode("source evidence");
    const fingerprint = await fingerprintBytes(bytes);
    const artifact = {
      fingerprint,
      name: "source.txt",
      mimeType: "text/plain",
      kind: "beo",
      parserVersion: "1",
      recognitionEvidence: [],
      importedAt: "2026-09-15T00:00:00Z",
    };
    const packet = parsePacketSnapshot({ ...snapshot, artifacts: [artifact] });
    const bundle = {
      format: "event-packet-portable",
      bundleVersion: 1,
      snapshot: packet,
      artifacts: [
        { fingerprint, base64: Buffer.from(bytes).toString("base64") },
      ],
    };
    const parsed = await parsePortablePacket(JSON.stringify(bundle));
    expect(parsed.snapshot).toEqual(packet);
    expect(parsed.artifacts[0].bytes).toEqual(bytes);
    await expect(verifyPacketArtifacts(packet, [])).rejects.toThrow("Missing");
    await expect(
      verifyPacketArtifacts(packet, [
        { fingerprint, bytes: new Uint8Array([0]) },
      ]),
    ).rejects.toThrow("fingerprint mismatch");
    await expect(
      verifyPacketArtifacts(packet, [...parsed.artifacts, ...parsed.artifacts]),
    ).rejects.toThrow("duplicate");
    await expect(
      parsePortablePacket({
        ...bundle,
        artifacts: [{ fingerprint, base64: "***" }],
      }),
    ).rejects.toThrow("base64");
  });
  it("recognizes JSON evidence in binary and browser loaders without materializing event facts", () => {
    const text = JSON.stringify(snapshot);
    const binary = loadEventBundle([
      { name: "packet.json", contents: Buffer.from(text) },
    ]);
    const browser = loadEventBundleFromText({
      csvFiles: [{ name: "packet.json", text }],
    });
    for (const loaded of [binary, browser]) {
      expect(loaded.recognized).toEqual([
        { name: "packet.json", source: "eventPacket" },
      ]);
      expect(loaded.bundle.header).toEqual({});
      expect(loaded.bundle.menu).toEqual([]);
      expect(loaded.bundle).toHaveProperty("packetEvidence.snapshots", [
        snapshot,
      ]);
    }
  });
});
