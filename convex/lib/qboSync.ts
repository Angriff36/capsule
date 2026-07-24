// QuickBooks Online OAuth2 + Accounting API helpers.
// Mirrors convex/lib/googleCalendar.ts: per-tenant OAuth with an HMAC-signed
// state token, encrypted refresh token stored in the manifestEvents ledger, and
// pure REST helpers for the reconcile action in convex/qboSync.ts.

const QBO_AUTHORIZATION_URL = "https://appcenter.intuit.com/connect/oauth2";
const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QBO_REVOKE_URL =
  "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
// minorversion pins the Accounting API response shape (Intuit's evolution knob).
const QBO_MINOR_VERSION = "73";

const SANDBOX_API_BASE = "https://sandbox-quickbooks.api.intuit.com";
const PRODUCTION_API_BASE = "https://quickbooks.api.intuit.com";

export interface QboOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  apiBaseUrl: string;
}

export interface QboOAuthState {
  actorId: string;
  tenantId: string;
  nonce: string;
  expiresAt: number;
}

export interface QboTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface QboClient {
  clientType: "company" | "person";
  companyName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
}

export class QboProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "QboProviderError";
  }
}

export function qboApiBaseUrl(environment: string | undefined): string {
  return environment?.trim().toLowerCase() === "production"
    ? PRODUCTION_API_BASE
    : SANDBOX_API_BASE;
}

export function buildQboAuthorizationUrl(
  config: QboOAuthConfig,
  state: string,
): string {
  const url = new URL(QBO_AUTHORIZATION_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", QBO_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function createQboOAuthState(
  value: QboOAuthState,
  secret: string,
): Promise<string> {
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(value)),
  );
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifyQboOAuthState(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<QboOAuthState | null> {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = await sign(payload, secret);
  if (!constantTimeEqual(signature, expected)) return null;

  try {
    const parsed = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payload)),
    ) as Partial<QboOAuthState>;
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
    return parsed as QboOAuthState;
  } catch {
    return null;
  }
}

export async function exchangeQboAuthorizationCode(
  config: QboOAuthConfig,
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<QboTokenResponse> {
  return requestToken(
    config,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
    fetcher,
  );
}

export async function refreshQboAccessToken(
  config: QboOAuthConfig,
  refreshToken: string,
  fetcher: typeof fetch = fetch,
): Promise<QboTokenResponse> {
  return requestToken(
    config,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    fetcher,
  );
}

export async function revokeQboToken(
  config: QboOAuthConfig,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(QBO_REVOKE_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${basicAuth(config)}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ token }),
  });
  if (!response.ok && response.status !== 400) {
    throw await providerError(response, "QuickBooks access could not be revoked");
  }
}

export function qboCustomerDisplayName(client: QboClient): string {
  const name =
    client.clientType === "company"
      ? (client.companyName ?? "").trim()
      : [client.givenName, client.familyName]
          .map((part) => (part ?? "").trim())
          .filter(Boolean)
          .join(" ");
  return name || "CapsuleX client";
}

export function buildQboCustomer(
  client: QboClient,
): Record<string, unknown> {
  const displayName = qboCustomerDisplayName(client);
  const resource: Record<string, unknown> = { DisplayName: displayName };
  if (client.clientType === "company" && client.companyName?.trim()) {
    resource.CompanyName = client.companyName.trim();
  }
  if (client.givenName?.trim()) resource.GivenName = client.givenName.trim();
  if (client.familyName?.trim()) resource.FamilyName = client.familyName.trim();
  return resource;
}

export function buildQboInvoice(input: {
  qboCustomerId: string;
  itemId: string;
  invoiceNumber: string | null;
  total: number;
  issuedAt: number | null;
  dueDate: number | null;
}): Record<string, unknown> {
  const amount = roundMoney(input.total);
  // ponytail: single summary line at the invoice total (ItemRef required by QBO);
  // per-line + tax mirroring can be added if the books need line detail.
  const resource: Record<string, unknown> = {
    CustomerRef: { value: input.qboCustomerId },
    Line: [
      {
        Amount: amount,
        DetailType: "SalesItemLineDetail",
        Description: input.invoiceNumber
          ? `CapsuleX invoice ${input.invoiceNumber}`
          : "CapsuleX invoice",
        SalesItemLineDetail: {
          ItemRef: { value: input.itemId },
          Qty: 1,
          UnitPrice: amount,
        },
      },
    ],
  };
  const docNumber = (input.invoiceNumber ?? "").trim().slice(0, 21);
  if (docNumber) resource.DocNumber = docNumber;
  if (input.issuedAt != null) resource.TxnDate = toQboDate(input.issuedAt);
  if (input.dueDate != null) resource.DueDate = toQboDate(input.dueDate);
  return resource;
}

export function buildQboPayment(input: {
  qboCustomerId: string;
  qboInvoiceId: string;
  amount: number;
  recordedAt: number | null;
}): Record<string, unknown> {
  const amount = roundMoney(input.amount);
  const resource: Record<string, unknown> = {
    CustomerRef: { value: input.qboCustomerId },
    TotalAmt: amount,
    Line: [
      {
        Amount: amount,
        LinkedTxn: [{ TxnId: input.qboInvoiceId, TxnType: "Invoice" }],
      },
    ],
  };
  if (input.recordedAt != null) resource.TxnDate = toQboDate(input.recordedAt);
  return resource;
}

export async function findQboCustomerId(input: {
  config: QboOAuthConfig;
  realmId: string;
  accessToken: string;
  displayName: string;
  fetcher?: typeof fetch;
}): Promise<string | null> {
  const escaped = input.displayName.replace(/\\/gu, "\\\\").replace(/'/gu, "\\'");
  const query = `SELECT Id FROM Customer WHERE DisplayName = '${escaped}'`;
  const body = await qboQuery(input.config, input.realmId, input.accessToken, query, input.fetcher);
  const rows = asArray(asRecord(body.QueryResponse).Customer);
  const id = rows.length > 0 ? stringField(asRecord(rows[0]).Id) : null;
  return id;
}

export async function resolveQboServiceItemId(input: {
  config: QboOAuthConfig;
  realmId: string;
  accessToken: string;
  fetcher?: typeof fetch;
}): Promise<string | null> {
  const query =
    "SELECT Id, Type, Active FROM Item WHERE Type = 'Service' MAXRESULTS 100";
  const body = await qboQuery(input.config, input.realmId, input.accessToken, query, input.fetcher);
  const rows = asArray(asRecord(body.QueryResponse).Item);
  for (const row of rows) {
    const record = asRecord(row);
    if (record.Active === false) continue;
    const id = stringField(record.Id);
    if (id) return id;
  }
  return null;
}

export async function createQboEntity(input: {
  config: QboOAuthConfig;
  realmId: string;
  accessToken: string;
  entity: "customer" | "invoice" | "payment";
  resource: Record<string, unknown>;
  fetcher?: typeof fetch;
}): Promise<string> {
  const url = `${qboEntityUrl(input.config, input.realmId, input.entity)}?minorversion=${QBO_MINOR_VERSION}`;
  const response = await (input.fetcher ?? fetch)(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(input.resource),
  });
  if (!response.ok) {
    throw await providerError(
      response,
      `QuickBooks ${input.entity} could not be created`,
    );
  }
  const body = (await response.json()) as Record<string, unknown>;
  const key = input.entity.charAt(0).toUpperCase() + input.entity.slice(1);
  const created = asRecord(body[key]);
  const id = stringField(created.Id);
  if (!id) {
    throw new QboProviderError(
      `QuickBooks did not return an id for the created ${input.entity}.`,
      response.status,
    );
  }
  return id;
}

export function safeQboProviderMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message
    .replace(/[\r\n]+/gu, " ")
    .replace(/(?:AB[0-9]|eyJ|Bearer\s+)[A-Za-z0-9._~+/=-]+/gu, "[redacted-token]")
    .slice(0, 500);
}

async function requestToken(
  config: QboOAuthConfig,
  body: URLSearchParams,
  fetcher: typeof fetch,
): Promise<QboTokenResponse> {
  const response = await fetcher(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${basicAuth(config)}`,
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });
  if (!response.ok) {
    throw await providerError(response, "QuickBooks authorization failed");
  }
  const data = (await response.json()) as Record<string, unknown>;
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new QboProviderError(
      "QuickBooks authorization did not return an access token.",
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

async function qboQuery(
  config: QboOAuthConfig,
  realmId: string,
  accessToken: string,
  query: string,
  fetcher: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const url = `${config.apiBaseUrl}/v3/company/${encodeURIComponent(realmId)}/query?query=${encodeURIComponent(query)}&minorversion=${QBO_MINOR_VERSION}`;
  const response = await fetcher(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  });
  if (!response.ok) {
    throw await providerError(response, "QuickBooks query failed");
  }
  return (await response.json()) as Record<string, unknown>;
}

function qboEntityUrl(
  config: QboOAuthConfig,
  realmId: string,
  entity: string,
): string {
  return `${config.apiBaseUrl}/v3/company/${encodeURIComponent(realmId)}/${entity}`;
}

function basicAuth(config: QboOAuthConfig): string {
  return btoa(`${config.clientId}:${config.clientSecret}`);
}

async function providerError(
  response: Response,
  fallback: string,
): Promise<QboProviderError> {
  let code: string | undefined;
  let message = fallback;
  try {
    const body = (await response.json()) as Record<string, unknown>;
    // OAuth errors: { error, error_description }. API errors: { Fault: { Error: [{ Message, Detail, code }] } }.
    if (typeof body.error === "string") {
      code = body.error;
      message = `${fallback}: ${typeof body.error_description === "string" ? body.error_description : body.error}`;
    } else {
      const fault = asRecord(body.Fault);
      const first = asRecord(asArray(fault.Error)[0]);
      const detail = stringField(first.Detail) ?? stringField(first.Message);
      if (typeof first.code === "string") code = first.code;
      if (detail) message = `${fallback}: ${detail}`;
    }
  } catch {
    // Provider may return an empty or non-JSON body.
  }
  return new QboProviderError(message, response.status, code);
}

function roundMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toQboDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
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
