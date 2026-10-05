/**
 * Field-encryption key for runtime proofs: a random 32-byte AES-GCM key made
 * per run, so no key material is committed. A key already set is kept.
 */
export function ensureTestFieldEncryptionKey(): void {
  if (process.env.CONVEX_FIELD_ENCRYPTION_KEY) return;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  process.env.CONVEX_FIELD_ENCRYPTION_KEY =
    Buffer.from(bytes).toString("base64");
}
