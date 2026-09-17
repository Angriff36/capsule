import { buildWorkbook } from "./buildWorkbook";
import { renderWorkbook } from "./renderWorkbook";
import { canonicalJson, type EventPacketSnapshot } from "./model";

export interface PacketPreparationPorts {
  read(): Promise<{
    snapshot: EventPacketSnapshot;
    currentFingerprint: string;
    latestRevision: { id: string; fingerprint: string; stale: boolean } | null;
  }>;
  upload(file: {
    bytes: Uint8Array;
    purpose: "pdf" | "snapshot";
    mimeType: string;
    name: string;
    inputFingerprint?: string;
  }): Promise<{ storageId: string }>;
  record(input: {
    inputFingerprint: string;
    pdfStorageId: string;
    snapshotStorageId: string;
  }): Promise<{ id: string }>;
}

/** Read immediately before rendering; the server rechecks the same fingerprint at commit. */
export async function prepareNativeWorkbook(ports: PacketPreparationPorts) {
  const current = await ports.read();
  const previous = current.latestRevision;
  if (
    previous &&
    !previous.stale &&
    previous.fingerprint === current.currentFingerprint
  )
    return { revisionId: previous.id, reused: true };
  const workbook = buildWorkbook(current.snapshot, {
    revision: current.snapshot.revisions.length + 1,
    generatedAt: new Date().toISOString(),
  });
  const rendered = await renderWorkbook(workbook);
  if (rendered.audit.violations.length)
    throw new Error(
      "The workbook did not pass its page layout check. Please retry before printing.",
    );
  const name = `event-${current.snapshot.identity.invoiceNumber}-${current.snapshot.identity.eventDate}`;
  const pdf = await ports.upload({
    bytes: rendered.bytes,
    purpose: "pdf",
    mimeType: "application/pdf",
    name: `${name}.pdf`,
    inputFingerprint: current.currentFingerprint,
  });
  const snapshot = await ports.upload({
    bytes: new TextEncoder().encode(canonicalJson(current.snapshot)),
    purpose: "snapshot",
    mimeType: "application/json",
    name: `${name}.snapshot.json`,
  });
  const revision = await ports.record({
    inputFingerprint: current.currentFingerprint,
    pdfStorageId: pdf.storageId,
    snapshotStorageId: snapshot.storageId,
  });
  return { revisionId: revision.id, reused: false };
}
