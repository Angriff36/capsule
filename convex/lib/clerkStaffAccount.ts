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

export class ClerkStaffAccountError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

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
          // This instance requires a username. Keep that provider detail out
          // of hiring: staff still use their email/link, never choose an id.
          username: `staff_${crypto.randomUUID().replaceAll("-", "")}`,
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

  /** Clerk owns delivery; the hired account already exists, so its invitation
   * enters the app's existing SignIn ticket flow rather than a second signup.
   * Capsule's Person role remains authoritative, not the provider member role.
   */
  async sendOrganizationInvitation(input: { organizationId: string; email: string; appUrl: string }): Promise<boolean> {
    const url = `https://api.clerk.com/v1/organizations/${encodeURIComponent(input.organizationId)}/invitations`;
    const send = () => this.request<{ id?: string; status?: string }>(url,
      { method: "POST", body: JSON.stringify({ email_address: input.email, role: "org:member", redirect_url: input.appUrl }) });
    let invitation;
    try {
      invitation = await send();
    } catch (error) {
      if (!(error instanceof ClerkStaffAccountError)) throw error;
      // An accepted invitation is not a reusable login email. Preserve the
      // account, membership and password; tell the manager to use normal login.
      if (error.code === "already_a_member_in_organization") return false;
      if (error.code !== "organization_invitation_not_unique") throw error;
      // Resend replaces only this recipient's pending invitation, never a
      // membership or another employee's invitation.
      for (let offset = 0; ; offset += 100) {
        const page = await this.request<{ data: Array<{ id: string; email_address: string; status: string }>; total_count: number }>(`${url}?status=pending&limit=100&offset=${offset}`);
        const pending = page.data.find(row => row.status === "pending" && row.email_address.toLowerCase() === input.email.toLowerCase());
        if (pending) {
          await this.request(`${url}/${encodeURIComponent(pending.id)}/revoke`, { method: "POST" });
          break;
        }
        if (offset + page.data.length >= page.total_count || page.data.length === 0) throw error;
      }
      invitation = await send();
    }
    if (!invitation.id || invitation.status !== "pending") {
      throw new Error("The sign-in service did not confirm the invitation.");
    }
    return true;
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
      throw detail;
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

async function readClerkError(response: Response): Promise<ClerkStaffAccountError> {
  try {
    const body = (await response.json()) as {
      errors?: Array<{ message?: string; long_message?: string; code?: string }>;
      message?: string;
    };
    const first = body.errors?.[0];
    return new ClerkStaffAccountError(
      first?.long_message ||
      first?.message ||
      body.message ||
      "The sign-in service rejected the request.", first?.code
    );
  } catch {
    return new ClerkStaffAccountError("The sign-in service rejected the request.");
  }
}
