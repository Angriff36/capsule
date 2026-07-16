/**
 * AUTHOR SEAM — emitted by Builder convex-application preset.
 * Not Manifest domain logic. Do not inline crypto into generated mutations.
 *
 * Contract (Manifest Convex projection):
 *   encrypt(plaintext, metadata) → { ciphertext, keyId }
 *   decrypt(ciphertext, keyId, metadata) → plaintext
 *
 * Local/dev default uses AES-GCM with CONVEX_FIELD_ENCRYPTION_KEY (32-byte
 * base64 or utf8 secret). Replace with KMS/IdP-backed keys before production.
 */
export interface EncryptionMetadata {
  ctx: unknown;
  entity: string;
  property: string;
}

const DEFAULT_KEY_ID = "local-v1";

export async function encrypt(
  plaintext: string,
  _metadata: EncryptionMetadata,
): Promise<{ ciphertext: string; keyId: string }> {
  const key = await loadAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    toBufferSource(encoded),
  );
  const packed = new Uint8Array(iv.length + cipherBuf.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipherBuf), iv.length);
  return { ciphertext: bytesToBase64(packed), keyId: DEFAULT_KEY_ID };
}

export async function decrypt(
  ciphertext: string,
  keyId: string,
  _metadata: EncryptionMetadata,
): Promise<string> {
  if (keyId !== DEFAULT_KEY_ID) {
    throw new Error(`Unknown Manifest encryption key id: ${keyId}`);
  }
  const key = await loadAesKey();
  const packed = base64ToBytes(ciphertext);
  if (packed.length < 13) throw new Error("Invalid Manifest ciphertext");
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBufferSource(iv) },
    key,
    toBufferSource(data),
  );
  return new TextDecoder().decode(plainBuf);
}

async function loadAesKey(): Promise<CryptoKey> {
  const secret = process.env.CONVEX_FIELD_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "CONVEX_FIELD_ENCRYPTION_KEY is required for encrypted Manifest fields",
    );
  }
  const raw =
    secret.length === 44
      ? base64ToBytes(secret)
      : new TextEncoder().encode(secret);
  const material = raw.byteLength === 32 ? raw : await sha256(raw);
  return crypto.subtle.importKey(
    "raw",
    toBufferSource(material),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", toBufferSource(bytes));
  return new Uint8Array(digest);
}

/** TS 5.9 + DOM lib: Uint8Array<ArrayBufferLike> is not BufferSource without a copy. */
function toBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
