/**
 * AUTHOR SEAM — Clerk Backend user lookup/create for hire-time sign-in.
 * Identity provider stays behind Capsule; staff never see these ids.
 */

export type ClerkStaffAccount = {
  userId: string;
  passwordEnabled: boolean;
};

type ClerkUserPayload = {
  id?: string;
  password_enabled?: boolean;
};

export class ClerkStaffAccountDirectory {
  constructor(
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async findByEmail(email: string): Promise<ClerkStaffAccount | null> {
    const params = new URLSearchParams();
    params.append("email_address", email);
    params.set("limit", "5");
    const users = await this.request<ClerkUserPayload[]>(
      `https://api.clerk.com/v1/users?${params.toString()}`,
    );
    const match = users.find((row) => typeof row.id === "string" && row.id);
    if (!match?.id) return null;
    return {
      userId: match.id,
      passwordEnabled: match.password_enabled === true,
    };
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
    return { userId: created.id, passwordEnabled: true };
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
