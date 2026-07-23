/**
 * AUTHOR SEAM — stateless, tamper-resistant client portal links.
 *
 * The existing field-encryption secret is high-entropy server-only material.
 * Hashing it with a feature/version label derives a separate HMAC key without
 * introducing another deployment secret or persisting bearer tokens.
 */

const TOKEN_VERSION = 1;
const TOKEN_KEY_CONTEXT = "capsule:client-portal:v1";
const MAX_TOKEN_LENGTH = 2048;

export interface ClientPortalTokenPayload {
  version: typeof TOKEN_VERSION;
  eventId: string;
  tenantId: string;
}

export async function createClientPortalToken(input: {
  eventId: string;
  tenantId: string;
}): Promise<string> {
  const payload: ClientPortalTokenPayload = {
    version: TOKEN_VERSION,
    eventId: input.eventId,
    tenantId: input.tenantId,
  };
  const encodedPayload = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await loadPortalKey(),
    toBufferSource(new TextEncoder().encode(encodedPayload)),
  );
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyClientPortalToken(
  token: string,
): Promise<ClientPortalTokenPayload | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  try {
    const payloadBytes = base64UrlToBytes(parts[0]);
    const signatureBytes = base64UrlToBytes(parts[1]);
    const valid = await crypto.subtle.verify(
      "HMAC",
      await loadPortalKey(),
      toBufferSource(signatureBytes),
      toBufferSource(new TextEncoder().encode(parts[0])),
    );
    if (!valid) return null;

    const parsed = JSON.parse(
      new TextDecoder().decode(payloadBytes),
    ) as Partial<ClientPortalTokenPayload>;
    if (
      parsed.version !== TOKEN_VERSION ||
      typeof parsed.eventId !== "string" ||
      parsed.eventId.length === 0 ||
      typeof parsed.tenantId !== "string" ||
      parsed.tenantId.length === 0
    ) {
      return null;
    }
    return parsed as ClientPortalTokenPayload;
  } catch {
    return null;
  }
}

async function loadPortalKey(): Promise<CryptoKey> {
  const secret = process.env.CONVEX_FIELD_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "CONVEX_FIELD_ENCRYPTION_KEY is required for client portal links",
    );
  }
  const material = await crypto.subtle.digest(
    "SHA-256",
    toBufferSource(
      new TextEncoder().encode(`${TOKEN_KEY_CONTEXT}:${secret}`),
    ),
  );
  return crypto.subtle.importKey(
    "raw",
    material,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Invalid base64url value");
  }
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

