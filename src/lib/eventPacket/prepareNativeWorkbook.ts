import { buildWorkbook } from "./buildWorkbook";
import { renderWorkbook } from "./renderWorkbook";
import { canonicalJson, type EventPacketSnapshot } from "./model";
import type { FinalLockPrint } from "./finalLock/evaluate";
import type { AttachedPrintFile } from "./appendAttachedFiles";

export interface PacketPreparationPorts {
  read(): Promise<{
    snapshot: EventPacketSnapshot;
    currentFingerprint: string;
    finalLock: FinalLockPrint;
    finalLockFingerprint: string;
    latestRevision: { id: string; fingerprint: string; stale: boolean } | null;
  }>;
  upload(file: {
    bytes: Uint8Array;
    purpose: "pdf" | "snapshot";
    mimeType: string;
    name: string;
    inputFingerprint?: string;
    finalLockFingerprint?: string;
  }): Promise<{ storageId: string }>;
  /** Drawings, maps and uploaded papers that print at the back. */
  files?(snapshot: EventPacketSnapshot): Promise<AttachedPrintFile[]>;
  record(input: {
    inputFingerprint: string;
    finalLockFingerprint: string;
    pdfStorageId: string;
    snapshotStorageId: string;
  }): Promise<{ id: string }>;
}

/** Read immediately before rendering; the server rechecks the same fingerprints at commit. */
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
    finalLock: current.finalLock.lines,
  });
  const rendered = await renderWorkbook(
    workbook,
    ports.files ? await ports.files(current.snapshot) : [],
  );
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
    finalLockFingerprint: current.finalLockFingerprint,
  });
  // The Final Lock answers the PDF shows travel with the snapshot, so the
  // revision stores exactly what was printed.
  const snapshot = await ports.upload({
    bytes: new TextEncoder().encode(
      canonicalJson({ ...current.snapshot, finalLock: current.finalLock }),
    ),
    purpose: "snapshot",
    mimeType: "application/json",
    name: `${name}.snapshot.json`,
  });
  const revision = await ports.record({
    inputFingerprint: current.currentFingerprint,
    finalLockFingerprint: current.finalLockFingerprint,
    pdfStorageId: pdf.storageId,
    snapshotStorageId: snapshot.storageId,
  });
  return { revisionId: revision.id, reused: false };
}
