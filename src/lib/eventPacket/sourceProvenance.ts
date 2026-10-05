import type { SourceKind } from "./model";

/** One kept source file as the office sees it: what, who, when, which copy. */
export interface SourceProvenance {
  /** SHA-256 of the stored bytes, worked out by the server on upload. */
  checksum: string;
  name: string;
  kind: SourceKind;
  mimeType: string;
  byteSize: number | null;
  uploadedAt: string | null;
  uploadedBy: string;
  /** The time zone its wall-clock times were read in. */
  timeZone: string | null;
  /** How many values Capsule read from it. */
  valuesRead: number;
  /** A newer copy with the same name and kind replaced it; its values no longer count. */
  replaced: boolean;
}

interface StoredSource {
  fingerprint?: string;
  name?: string;
  mimeType?: string;
  byteSize?: number;
  uploadedBy?: string;
  createdAt?: number;
  purpose?: string;
  metadataJson?: string | null;
  observationsJson?: string | null;
  contextJson?: string | null;
}

/** One plain line: who added it, when, size, checksum start, replaced or not. */
export function describeSource(source: SourceProvenance): string {
  const when = source.uploadedAt
    ? new Date(source.uploadedAt).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "at an unknown time";
  const size =
    source.byteSize == null
      ? ""
      : source.byteSize < 1024
        ? `${source.byteSize} bytes`
        : `${Math.round(source.byteSize / 1024)} KB`;
  return [
    `Added by ${source.uploadedBy}, ${when}`,
    size,
    source.kind === "diagram"
      ? "kept as a picture"
      : `${source.valuesRead} value${source.valuesRead === 1 ? "" : "s"} read`,
    source.timeZone ? `times read in ${source.timeZone}` : "",
    `file check ${source.checksum.slice(0, 12)}`,
    source.replaced ? "replaced by a newer copy" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Source rows of one event, newest first; names come from the sign-in lookup. */
export function sourceProvenance(
  rows: StoredSource[],
  nameOf: (uploadedBy: string | undefined) => string,
): SourceProvenance[] {
  return rows
    .filter((r) => r.purpose === "source" && r.metadataJson)
    .map((r) => {
      const metadata = JSON.parse(r.metadataJson!);
      const context = JSON.parse(r.contextJson ?? "{}");
      return {
        checksum: r.fingerprint ?? metadata.fingerprint,
        name: r.name ?? metadata.name,
        kind: metadata.kind,
        mimeType: r.mimeType ?? metadata.mimeType,
        byteSize: r.byteSize ?? null,
        uploadedAt:
          r.createdAt != null ? new Date(r.createdAt).toISOString() : null,
        uploadedBy: nameOf(r.uploadedBy),
        timeZone: context.timeZone ?? null,
        valuesRead: JSON.parse(r.observationsJson ?? "[]").length,
        replaced: context.active === false,
      };
    })
    .sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));
}
