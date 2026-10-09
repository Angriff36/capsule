/**
 * Checks that a request really came from the email service (Resend signs its
 * webhooks the Svix way): base64 HMAC-SHA256, keyed with the base64 secret
 * after "whsec_", over "<svix-id>.<svix-timestamp>.<raw body>". The header
 * may hold several space-separated "v1,<signature>" values; one match is
 * enough. A timestamp more than five minutes off is refused, so an old
 * captured request cannot be sent again.
 */
const TOLERANCE_SECONDS = 5 * 60;

export async function svixSignatureMatches(args: {
  secret: string;
  id: string;
  timestamp: string;
  body: string;
  signature: string;
  nowMs?: number;
}): Promise<boolean> {
  const seconds = Number(args.timestamp);
  if (!args.id || !Number.isFinite(seconds)) return false;
  const now = (args.nowMs ?? Date.now()) / 1000;
  if (Math.abs(now - seconds) > TOLERANCE_SECONDS) return false;

  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    const raw = atob(args.secret.trim().replace(/^whsec_/, ""));
    keyBytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${args.id}.${args.timestamp}.${args.body}`),
    ),
  );
  const expected = btoa(String.fromCharCode(...digest));
  return args.signature
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .some((part) => sameText(part.slice(3), expected));
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
