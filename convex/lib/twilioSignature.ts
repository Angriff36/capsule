/**
 * Checks that a request really came from Twilio (X-Twilio-Signature):
 * base64 HMAC-SHA1, keyed with the account's auth token, over the full URL
 * followed by every form field name and value, sorted by name.
 */
export async function twilioSignatureMatches(args: {
  authToken: string;
  url: string;
  params: Array<[string, string]>;
  signature: string;
}): Promise<boolean> {
  const sorted = [...args.params].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const data = args.url + sorted.map(([key, value]) => key + value).join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(args.authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)),
  );
  const expected = btoa(String.fromCharCode(...digest));
  if (expected.length !== args.signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ args.signature.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Checks a Twilio webhook request. Behind a proxy the URL Twilio called can
 * differ from the one this server sees, so the public site address is also
 * tried.
 */
export async function twilioRequestSigned(args: {
  authToken: string;
  request: Request;
  params: Array<[string, string]>;
}): Promise<boolean> {
  const signature = args.request.headers.get("X-Twilio-Signature") ?? "";
  const requestUrl = new URL(args.request.url);
  const urls = [args.request.url];
  const site = process.env.CONVEX_SITE_URL?.trim().replace(/\/$/, "");
  if (site) urls.push(`${site}${requestUrl.pathname}${requestUrl.search}`);
  for (const url of urls) {
    if (
      await twilioSignatureMatches({
        authToken: args.authToken,
        url,
        params: args.params,
        signature,
      })
    )
      return true;
  }
  return false;
}
