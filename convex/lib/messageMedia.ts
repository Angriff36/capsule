// PL-INBOX (AC-104, AC-247, AC-112): the photos and files that came with a
// provider message, kept as references only. A link to the file is never
// stored, so a private attachment can only be opened at the provider by
// someone the provider lets in. The same file sent twice is listed once.

export interface MessageMediaRef {
  id: string;
  kind: string;
  name?: string;
}

const MEDIA_LIST_KEYS = ["media", "attachments", "files"];
const MEDIA_ID_KEYS = ["id", "mediaId", "media_id", "attachmentId", "attachment_id"];
const MEDIA_KIND_KEYS = ["kind", "type", "mimeType", "mime_type", "contentType"];
const MEDIA_NAME_KEYS = ["name", "filename", "fileName", "title"];
const MAX_MEDIA = 20;

function firstText(item: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

/** Media references from a raw provider envelope, without repeats or links. */
export function mediaRefsFromEnvelope(
  envelope: Record<string, unknown>,
): MessageMediaRef[] {
  const refs: MessageMediaRef[] = [];
  const seen = new Set<string>();
  for (const listKey of MEDIA_LIST_KEYS) {
    const list = envelope[listKey];
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const item = raw as Record<string, unknown>;
      const id = firstText(item, MEDIA_ID_KEYS);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const name = firstText(item, MEDIA_NAME_KEYS);
      refs.push({
        id,
        kind: firstText(item, MEDIA_KIND_KEYS) ?? "file",
        ...(name ? { name } : {}),
      });
      if (refs.length >= MAX_MEDIA) return refs;
    }
  }
  return refs;
}
