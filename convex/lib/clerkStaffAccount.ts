/**
 * AUTHOR SEAM — Clerk Backend user lookup/create for hire-time sign-in.
 * Identity provider stays behind Capsule; staff never see these ids.
 * Lookup only accepts a verified primary email — same trust anchor as
 * convex/authLink.ts. Unverified leftovers fail closed.
 */

export type ClerkStaffAccount = {
  userId: string;
  passwordEnabled: boolean;
  hasSignedIn: boolean;
};

type ClerkEmailAddress = {
  id?: string;
  email_address?: string;
  verification?: { status?: string } | null;
};

type ClerkUserPayload = {
  id?: string;
  password_enabled?: boolean;
  last_sign_in_at?: number | null;
  primary_email_address_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
};

export class ClerkStaffAccountDirectory {
  constructor(
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async findByEmail(email: string): Promise<ClerkStaffAccount | null> {
    const wanted = email.trim().toLowerCase();
    const params = new URLSearchParams();
    params.append("email_address", wanted);
    params.set("limit", "5");
    const users = asUserList(
      await this.request<unknown>(
        `https://api.clerk.com/v1/users?${params.toString()}`,
      ),
    );
    const verified = users
      .map((row) => ({ row, account: toVerifiedAccount(row, wanted) }))
      .filter(
        (
          entry,
        ): entry is { row: ClerkUserPayload; account: ClerkStaffAccount } =>
          entry.account !== null,
      );
    if (verified.length === 1) return verified[0]!.account;
    if (verified.length > 1) {
      throw new Error(
        "More than one verified sign-in uses this email. An admin must clean that up first.",
      );
    }
    if (users.length > 0) {
      throw new Error(
        "A leftover sign-in uses this email but it is not verified. They need to verify it, or an admin must remove the leftover account.",
      );
    }
    return null;
  }

  async createWithPassword(input: {
    email: string;
    givenName: string;
    familyName: string;
    password: string;
  }): Promise<ClerkStaffAccount> {
    const created = await this.request<ClerkUserPayload>(
      "https://api.clerk.com/v1/users",
      {
        method: "POST",
        body: JSON.stringify({
          email_address: [input.email],
          first_name: input.givenName,
          last_name: input.familyName,
          password: input.password,
          skip_password_checks: true,
          skip_password_requirement: false,
        }),
      },
    );
    if (!created.id) {
      throw new Error("The sign-in service did not return an account id.");
    }
    return {
      userId: created.id,
      passwordEnabled: true,
      hasSignedIn: false,
    };
  }

  async setPassword(userId: string, password: string): Promise<void> {
    await this.request<ClerkUserPayload>(
      `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          password,
          skip_password_checks: true,
          sign_out_of_other_sessions: false,
        }),
      },
    );
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
    } catch {
      throw new Error("The sign-in service could not be reached.");
    }
    if (!response.ok) {
      const detail = await readClerkError(response);
      throw new Error(detail);
    }
    return (await response.json()) as T;
  }
}

function asUserList(body: unknown): ClerkUserPayload[] {
  if (Array.isArray(body)) return body as ClerkUserPayload[];
  if (
    body &&
    typeof body === "object" &&
    Array.isArray((body as { data?: unknown }).data)
  ) {
    return (body as { data: ClerkUserPayload[] }).data;
  }
  return [];
}

function toVerifiedAccount(
  user: ClerkUserPayload,
  wantedEmail: string,
): ClerkStaffAccount | null {
  if (typeof user.id !== "string" || !user.id) return null;
  const primary = user.email_addresses?.find(
    (row) => row.id === user.primary_email_address_id,
  );
  if (!primary) return null;
  if (primary.verification?.status !== "verified") return null;
  if ((primary.email_address ?? "").trim().toLowerCase() !== wantedEmail) {
    return null;
  }
  return {
    userId: user.id,
    passwordEnabled: user.password_enabled === true,
    hasSignedIn: typeof user.last_sign_in_at === "number",
  };
}

async function readClerkError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      errors?: Array<{ message?: string; long_message?: string }>;
      message?: string;
    };
    const first = body.errors?.[0];
    return (
      first?.long_message ||
      first?.message ||
      body.message ||
      "The sign-in service rejected the request."
    );
  } catch {
    return "The sign-in service rejected the request.";
  }
}
