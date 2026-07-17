/** Deterministic fingerprint for import source deduplication and provenance. */
export class SourceFingerprint {
  digest(text: string): string {
    let hash = 5381;
    const normalized = text.replace(/\r\n/g, "\n").trim();
    for (let index = 0; index < normalized.length; index += 1) {
      hash = (hash * 33) ^ normalized.charCodeAt(index);
    }
    return `fp-${(hash >>> 0).toString(16).padStart(8, "0")}-${normalized.length}`;
  }
}
