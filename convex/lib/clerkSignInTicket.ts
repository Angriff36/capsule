/**
 * AUTHOR SEAM — one-time Capsule sign-in link for a hired staff account.
 */

export type ClerkSignInTicket = {
  token: string;
  expiresInSeconds: number;
};

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;

export class ClerkSignInTicketIssuer {
  constructor(
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async issue(
    userId: string,
    expiresInSeconds = DEFAULT_TTL_SECONDS,
  ): Promise<ClerkSignInTicket> {
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.clerk.com/v1/sign_in_tokens", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          expires_in_seconds: expiresInSeconds,
        }),
      });
    } catch {
      throw new Error("Could not create the sign-in link.");
    }
    if (!response.ok) {
      throw new Error("Could not create the sign-in link.");
    }
    const body = (await response.json()) as { token?: string };
    if (!body.token) {
      throw new Error("The sign-in link came back empty.");
    }
    return { token: body.token, expiresInSeconds };
  }
}

export function capsuleSignInUrl(appOrigin: string, token: string): string {
  const origin = appOrigin.replace(/\/+$/u, "");
  const url = new URL(origin);
  url.searchParams.set("__clerk_ticket", token);
  return url.toString();
}
