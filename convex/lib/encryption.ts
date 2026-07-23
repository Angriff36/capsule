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
 *
 * Windows note: bare `bunx convex env set` often stores a trailing `\r`
 * (Convex CLI / PowerShell — NOT Git `.gitattributes`). Historical ciphertext
 * may be sealed with sha256(utf8(secretIncludingCR)). Decrypt tries every
 * plausible material so mixed rows still open; encrypt prefers the legacy CR
 * material when present so new writes stay compatible. Always set secrets with
 * `bun run convex:env-set -- NAME value` (see docs/operations/local-dev.md).
 */
export interface EncryptionMetadata {
  ctx: unknown;
  entity: string;
  property: string;
}

const DEFAULT_KEY_ID = "local-v1";

let cachedMaterials: Uint8Array[] | null = null;

export async function encrypt(
  plaintext: string,
  _metadata: EncryptionMetadata,
): Promise<{ ciphertext: string; keyId: string }> {
  try {
    const materials = await keyMaterials();
    const key = await importAesKey(materials[0]!);
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
  } catch (error) {
    throw new Error(
      `CONVEX_FIELD_ENCRYPTION_KEY encrypt failed: ${errorMessage(error)}`,
    );
  }
}

export async function decrypt(
  ciphertext: string,
  keyId: string,
  _metadata: EncryptionMetadata,
): Promise<string> {
  if (keyId !== DEFAULT_KEY_ID) {
    throw new Error(`Unknown Manifest encryption key id: ${keyId}`);
  }
  const packed = base64ToBytes(ciphertext);
  if (packed.length < 13) throw new Error("Invalid Manifest ciphertext");
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);

  let lastError: unknown;
  for (const material of await keyMaterials()) {
    try {
      const key = await importAesKey(material);
      const plainBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toBufferSource(iv) },
        key,
        toBufferSource(data),
      );
      return new TextDecoder().decode(plainBuf);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Decryption failed: ${errorMessage(lastError)}. Encryption key material may have drifted.`,
  );
}

async function keyMaterials(): Promise<Uint8Array[]> {
  if (cachedMaterials) return cachedMaterials;
  const secret = process.env.CONVEX_FIELD_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "CONVEX_FIELD_ENCRYPTION_KEY is required for encrypted Manifest fields",
    );
  }

  const materials: Uint8Array[] = [];
  const pushUnique = async (bytes: Uint8Array) => {
    if (materials.some((existing) => sameBytes(existing, bytes))) return;
    materials.push(bytes);
  };

  const trimmed = secret.trim();
  const utf8 = new TextEncoder();

  // ALWAYS try legacy Windows `convex env set` variants first — even when the
  // env value is clean now. Cleaning the key (strip CR/LF) used to drop these
  // and break decrypt on rows sealed with sha256(secret+"\r"). materials[0]
  // is encrypt preference; keep CR-first so new writes match that historical
  // corpus until an explicit re-encrypt migration.
  if (trimmed.length > 0) {
    await pushUnique(await sha256(utf8.encode(`${trimmed}\r`)));
    await pushUnique(await sha256(utf8.encode(`${trimmed}\r\n`)));
  }
  if (secret !== trimmed && secret !== `${trimmed}\r` && secret !== `${trimmed}\r\n`) {
    await pushUnique(await sha256(utf8.encode(secret)));
  }

  if (trimmed.length === 44) {
    try {
      await pushUnique(base64ToBytes(trimmed));
    } catch (error) {
      // Fall through to sha256 of trimmed secret if base64 is malformed.
      console.error(
        "[capsule-encryption] base64 key decode failed",
        errorMessage(error),
      );
      await pushUnique(await sha256(utf8.encode(trimmed)));
    }
  } else if (trimmed.length > 0) {
    const raw = utf8.encode(trimmed);
    await pushUnique(raw.byteLength === 32 ? raw : await sha256(raw));
  }

  if (materials.length === 0) {
    throw new Error(
      "CONVEX_FIELD_ENCRYPTION_KEY is required for encrypted Manifest fields",
    );
  }
  cachedMaterials = materials;
  return materials;
}

async function importAesKey(material: Uint8Array): Promise<CryptoKey> {
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

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
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

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}
