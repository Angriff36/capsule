import { PDFDocument } from "pdf-lib";

/**
 * The PDF names the Final Lock answers it shows in its own document info, so
 * the server can check the file's bytes rather than a caller's word.
 */
const PREFIX = "capsule-final-lock:";

export function stampFinalLock(doc: PDFDocument, fingerprint: string) {
  doc.setSubject(`${PREFIX}${fingerprint}`);
}

/** The Final Lock fingerprint a PDF carries; null when it carries none. */
export async function readFinalLockStamp(
  bytes: Uint8Array,
): Promise<string | null> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    return null;
  }
  const subject = doc.getSubject() ?? "";
  return subject.startsWith(PREFIX) ? subject.slice(PREFIX.length) : null;
}
