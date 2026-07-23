export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";

const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3";
const BASE32HEX = "0123456789abcdefghijklmnopqrstuv";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleOAuthState {
  actorId: string;
  tenantId: string;
  nonce: string;
  expiresAt: number;
}

export interface CapsuleCalendarEvent {
  eventId: string;
  title: string;
  startsAt: number;
  endsAt: number;
  venueName?: string | null;
  venueAddress?: string | null;
  expectedHeadcount: number;
}

export interface GoogleCalendarEventResource {
  id?: string;
  summary: string;
  description: string;
  location?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  extendedProperties: {
    private: { capsuleEventId: string };
  };
}

export interface GoogleTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export class GoogleProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "GoogleProviderError";
  }
}

export function buildGoogleAuthorizationUrl(
  config: GoogleOAuthConfig,
  state: string,
): string {
  const url = new URL(GOOGLE_AUTHORIZATION_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function createGoogleOAuthState(
  value: GoogleOAuthState,
  secret: string,
): Promise<string> {
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(value)),
  );
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifyGoogleOAuthState(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<GoogleOAuthState | null> {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = await sign(payload, secret);
  if (!constantTimeEqual(signature, expected)) return null;

  try {
    const parsed = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payload)),
    ) as Partial<GoogleOAuthState>;
    if (
      typeof parsed.actorId !== "string" ||
      !parsed.actorId ||
      typeof parsed.tenantId !== "string" ||
      !parsed.tenantId ||
      typeof parsed.nonce !== "string" ||
      !parsed.nonce ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt < now
    ) {
      return null;
    }
    return parsed as GoogleOAuthState;
  } catch {
    return null;
  }
}

export async function exchangeGoogleAuthorizationCode(
  config: GoogleOAuthConfig,
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<GoogleTokenResponse> {
  return requestToken(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
    fetcher,
  );
}

export async function refreshGoogleAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string,
  fetcher: typeof fetch = fetch,
): Promise<GoogleTokenResponse> {
  return requestToken(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    fetcher,
  );
}

export async function revokeGoogleToken(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  if (!response.ok && response.status !== 400) {
    throw await providerError(response, "Google access could not be revoked");
  }
}

export function buildGoogleCalendarEvent(
  event: CapsuleCalendarEvent,
): GoogleCalendarEventResource {
  const location = [event.venueName?.trim(), event.venueAddress?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(" — ");
  return {
    summary: event.title.trim() || "CapsuleX event",
    description: `Expected headcount: ${event.expectedHeadcount}\nSynced from CapsuleX.`,
    ...(location ? { location } : {}),
    start: { dateTime: new Date(event.startsAt).toISOString() },
    end: { dateTime: new Date(event.endsAt).toISOString() },
    extendedProperties: {
      private: { capsuleEventId: event.eventId },
    },
  };
}

export async function googleCalendarEventId(eventId: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`capsule-event:${eventId}`),
    ),
  );
  return `capsule${base32HexEncode(digest).slice(0, 40)}`;
}

export async function googleCalendarEventSignature(
  resource: GoogleCalendarEventResource,
): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(resource)),
    ),
  );
  return base64UrlEncode(digest);
}

export async function upsertGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  resource: GoogleCalendarEventResource;
  previouslySynced: boolean;
  fetcher?: typeof fetch;
}): Promise<void> {
  const fetcher = input.fetcher ?? fetch;
  const path = calendarEventUrl(input.calendarId, input.eventId);
  const update = () =>
    calendarRequest(path, input.accessToken, fetcher, {
      method: "PATCH",
      body: JSON.stringify(input.resource),
    });
  const insert = () =>
    calendarRequest(
      `${calendarEventsUrl(input.calendarId)}?sendUpdates=none`,
      input.accessToken,
      fetcher,
      {
        method: "POST",
        body: JSON.stringify({ ...input.resource, id: input.eventId }),
      },
    );

  if (input.previouslySynced) {
    try {
      await update();
      return;
    } catch (cause) {
      if (!(cause instanceof GoogleProviderError) || cause.status !== 404) {
        throw cause;
      }
    }
  }

  try {
    await insert();
  } catch (cause) {
    if (!(cause instanceof GoogleProviderError) || cause.status !== 409) {
      throw cause;
    }
    await update();
  }
}

export async function deleteGoogleCalendarEvent(input: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  const response = await (input.fetcher ?? fetch)(
    calendarEventUrl(input.calendarId, input.eventId),
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${input.accessToken}` },
    },
  );
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw await providerError(response, "Google Calendar event was not removed");
  }
}

export function safeGoogleProviderMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message
    .replace(/[\r\n]+/gu, " ")
    .replace(/(?:ya29\.|1\/)[A-Za-z0-9._~-]+/gu, "[redacted-token]")
    .slice(0, 500);
}

async function requestToken(
  body: URLSearchParams,
  fetcher: typeof fetch,
): Promise<GoogleTokenResponse> {
  const response = await fetcher(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw await providerError(response, "Google authorization failed");
  }
  const data = (await response.json()) as Record<string, unknown>;
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new GoogleProviderError(
      "Google authorization did not return an access token.",
      response.status,
    );
  }
  return {
    accessToken: data.access_token,
    ...(typeof data.refresh_token === "string"
      ? { refreshToken: data.refresh_token }
      : {}),
    ...(typeof data.expires_in === "number"
      ? { expiresIn: data.expires_in }
      : {}),
  };
}

async function calendarRequest(
  url: string,
  accessToken: string,
  fetcher: typeof fetch,
  init: RequestInit,
): Promise<void> {
  const response = await fetcher(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw await providerError(response, "Google Calendar event was not saved");
  }
}

async function providerError(
  response: Response,
  fallback: string,
): Promise<GoogleProviderError> {
  let code: string | undefined;
  let message = fallback;
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const rawError = body.error;
    if (typeof rawError === "string") {
      code = rawError;
      message = `${fallback}: ${rawError}`;
    } else if (rawError && typeof rawError === "object") {
      const error = rawError as Record<string, unknown>;
      if (typeof error.status === "string") code = error.status;
      if (typeof error.message === "string") {
        message = `${fallback}: ${error.message}`;
      }
    }
  } catch {
    // Provider may return an empty body (notably DELETE) or a non-JSON proxy error.
  }
  return new GoogleProviderError(message, response.status, code);
}

function calendarEventsUrl(calendarId: string): string {
  return `${GOOGLE_CALENDAR_API_URL}/calendars/${encodeURIComponent(calendarId)}/events`;
}

function calendarEventUrl(calendarId: string, eventId: string): string {
  return `${calendarEventsUrl(calendarId)}/${encodeURIComponent(eventId)}?sendUpdates=none`;
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return base64UrlEncode(new Uint8Array(signature));
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function base32HexEncode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32HEX[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32HEX[(value << (5 - bits)) & 31];
  return output;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = `${value.replace(/-/gu, "+").replace(/_/gu, "/")}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
