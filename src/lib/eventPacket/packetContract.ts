import { z } from "zod";
import { validateSnapshot } from "./schema";
import {
  canonicalJson,
  fingerprintBytes,
  type EventPacketSnapshot,
  type Observation,
  type SourceArtifact,
} from "./model";

/** Imported snapshots are evidence; their claimed approvals never authorize native updates. */
export interface PacketEvidence {
  snapshots: EventPacketSnapshot[];
  artifacts: SourceArtifact[];
  observations: Observation[];
}

export function parsePacketSnapshot(input: unknown): EventPacketSnapshot {
  return validateSnapshot(
    typeof input === "string" ? JSON.parse(input) : input,
  );
}

export interface PacketArtifactBytes {
  fingerprint: string;
  bytes: Uint8Array;
}

/** Byte verification is separate because a metadata-only snapshot cannot prove source content. */
export async function verifyPacketArtifacts(
  snapshot: EventPacketSnapshot,
  records: readonly PacketArtifactBytes[],
): Promise<void> {
  const packet = parsePacketSnapshot(snapshot);
  const expected = new Set(packet.artifacts.map((a) => a.fingerprint));
  const seen = new Set<string>();
  for (const record of records) {
    if (!expected.has(record.fingerprint) || seen.has(record.fingerprint))
      throw new Error("Unexpected or duplicate source bytes");
    if ((await fingerprintBytes(record.bytes)) !== record.fingerprint)
      throw new Error("Source fingerprint mismatch");
    seen.add(record.fingerprint);
  }
  if (seen.size !== expected.size) throw new Error("Missing source bytes");
}

const portableSchema = z
  .object({
    format: z.literal("event-packet-portable"),
    bundleVersion: z.literal(1),
    snapshot: z.unknown(),
    artifacts: z.array(
      z
        .object({
          fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
          base64: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export async function parsePortablePacket(input: unknown): Promise<{
  snapshot: EventPacketSnapshot;
  artifacts: PacketArtifactBytes[];
}> {
  const bundle = portableSchema.parse(
    typeof input === "string" ? JSON.parse(input) : input,
  );
  const snapshot = parsePacketSnapshot(bundle.snapshot);
  const artifacts = bundle.artifacts.map((record) => {
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        record.base64,
      )
    )
      throw new Error("Invalid source base64");
    return {
      fingerprint: record.fingerprint,
      bytes: Uint8Array.from(atob(record.base64), (c) => c.charCodeAt(0)),
    };
  });
  await verifyPacketArtifacts(snapshot, artifacts);
  return { snapshot, artifacts };
}

export function mergePacketEvidence(
  inputs: readonly PacketEvidence[],
): PacketEvidence {
  const snapshots = new Map<string, EventPacketSnapshot>();
  const artifacts = new Map<string, SourceArtifact>();
  const observations = new Map<string, Observation>();
  for (const input of inputs) {
    for (const raw of input.snapshots) {
      const snapshot = parsePacketSnapshot(raw);
      snapshots.set(canonicalJson(snapshot), snapshot);
      for (const artifact of snapshot.artifacts) {
        if (!artifacts.has(artifact.fingerprint))
          artifacts.set(artifact.fingerprint, artifact);
      }
      for (const observation of snapshot.observations)
        observations.set(canonicalJson(observation), observation);
    }
  }
  return {
    snapshots: [...snapshots.values()],
    artifacts: [...artifacts.values()],
    observations: [...observations.values()],
  };
}

/** Content recognition works independently of filenames. Portable bytes require the async verifier. */
export function packetEvidenceFromText(
  text: string,
): PacketEvidence | undefined {
  if (!text.trimStart().startsWith("{")) return undefined;
  const input = JSON.parse(text);
  if (input?.format === "event-packet-portable")
    throw new Error(
      "Portable source bytes require parsePortablePacket verification before import",
    );
  if (input?.schemaVersion === undefined) return undefined;
  const snapshot = parsePacketSnapshot(input);
  return mergePacketEvidence([
    { snapshots: [snapshot], artifacts: [], observations: [] },
  ]);
}
