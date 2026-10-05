/**
 * In-memory stand-in for the Clerk Backend API calls made by
 * convex/lib/clerkStaffAccount.ts. Records every call so proofs can show
 * which outside changes happened (and which did not).
 */
import { vi } from "vitest";

type FakeUser = { id: string; emails: { id: string; email: string }[] };

export type FakeClerkCall = { method: string; path: string; body?: unknown };

export function installFakeClerk(seed: { id: string; email: string }[] = []) {
  const users = new Map<string, FakeUser>();
  let nextId = 1;
  const add = (id: string, email: string) =>
    users.set(id, { id, emails: [{ id: `idn_${nextId++}`, email }] });
  for (const row of seed) add(row.id, row.email);
  const calls: FakeClerkCall[] = [];
  const invitations: { organizationId: string; email: string }[] = [];
  /** The next N invitation sends answer with this status instead. */
  const invitationFailures = { left: 0, status: 503 };

  const payload = (user: FakeUser) => ({
    id: user.id,
    password_enabled: true,
    last_sign_in_at: null,
    primary_email_address_id: user.emails[0]?.id ?? null,
    email_addresses: user.emails.map((row) => ({
      id: row.id,
      email_address: row.email,
      verification: { status: "verified" },
    })),
  });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const fakeFetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname, body });
    const parts = url.pathname.split("/").filter(Boolean); // v1/...
    if (parts[1] === "users" && parts.length === 2 && method === "GET") {
      const wanted = url.searchParams.get("email_address") ?? "";
      return json(
        [...users.values()]
          .filter((user) => user.emails.some((row) => row.email === wanted))
          .map(payload),
      );
    }
    if (parts[1] === "users" && parts.length === 2 && method === "POST") {
      const id = `user_created_${nextId++}`;
      add(id, (body as { email_address: string[] }).email_address[0]!);
      return json(payload(users.get(id)!));
    }
    if (parts[1] === "users" && parts.length === 3) {
      const user = users.get(decodeURIComponent(parts[2]!));
      if (!user) return json({ errors: [{ code: "resource_not_found" }] }, 404);
      if (method === "DELETE") {
        users.delete(user.id);
        return json({ id: user.id, deleted: true });
      }
      return json(payload(user));
    }
    if (parts[1] === "email_addresses" && method === "POST") {
      const { user_id, email_address } = body as {
        user_id: string;
        email_address: string;
      };
      const taken = [...users.values()].some((user) =>
        user.emails.some((row) => row.email === email_address),
      );
      if (taken) {
        return json({ errors: [{ code: "form_identifier_exists" }] }, 422);
      }
      const row = { id: `idn_${nextId++}`, email: email_address };
      users.get(user_id)!.emails.unshift(row);
      return json({ id: row.id, email_address });
    }
    if (parts[1] === "email_addresses" && method === "DELETE") {
      for (const user of users.values()) {
        user.emails = user.emails.filter((row) => row.id !== parts[2]);
      }
      return json({ deleted: true });
    }
    if (parts[1] === "organizations" && parts[3] === "invitations") {
      if (invitationFailures.left > 0) {
        invitationFailures.left -= 1;
        return json(
          { errors: [{ code: "service_down", message: "sk_live_leak down" }] },
          invitationFailures.status,
        );
      }
      invitations.push({
        organizationId: decodeURIComponent(parts[2]!),
        email: (body as { email_address: string }).email_address,
      });
      return json({ id: `inv_${nextId++}`, status: "pending" });
    }
    return json({ errors: [{ code: "unexpected_call" }] }, 500);
  });

  vi.stubGlobal("fetch", fakeFetch);
  process.env.CLERK_SECRET_KEY = "sk_test_fake";
  process.env.CAPSULE_PUBLIC_APP_URL = "https://capsule.example.test";

  return {
    users,
    calls,
    invitations,
    emailsOf: (id: string) => users.get(id)?.emails.map((row) => row.email),
    writes: () => calls.filter((call) => call.method !== "GET"),
    failInvitations: (count: number, status = 503) => {
      invitationFailures.left = count;
      invitationFailures.status = status;
    },
    restore: () => {
      vi.unstubAllGlobals();
      delete process.env.CLERK_SECRET_KEY;
      delete process.env.CAPSULE_PUBLIC_APP_URL;
    },
  };
}
