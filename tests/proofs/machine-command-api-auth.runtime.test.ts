/**
 * Runtime proof: a remote machine (Clerk M2M JWT, subject `mch_…`) reaches the
 * authenticated HTTP command dispatcher with no browser session and no human
 * JWT. Tenant + role come only from the linked Person row; claims on the
 * machine token cannot pick a tenant or role.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {
  createManifestTestContext,
  type ManifestConvexTestHarness,
} from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

type Actor = ManifestConvexTestHarness & {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
};

const TENANT = "tenant-machine-auth";
const OTHER_TENANT = "tenant-machine-auth-other";
const MACHINE_SUBJECT = "mch_test_remote_agent";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function post(actor: Actor, path: string, body: unknown) {
  const res = await actor.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    json: (await res.json()) as Record<string, unknown>,
  };
}

describe("runtime proof: machine (M2M) auth on the command API", () => {
  it("authenticates a machine token, then authorizes only via the linked Person", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });

    // The machine token carries claims the machine-secret holder chose:
    // a spoofed tenant and role. There is no browser session and no human
    // (user_…) subject anywhere in this test.
    const machine = proof.asRole({
      subject: MACHINE_SUBJECT,
      role: "admin",
      tenantId: OTHER_TENANT,
      tokenIdentifier: `https://clerk.example|${MACHINE_SUBJECT}`,
    }) as Actor;

    // No credential at all → 401.
    const anonymous = convexTest(schema, modules) as unknown as Actor;
    const noAuth = await anonymous.fetch("/api/manifest/commands");
    expect(noAuth.status).toBe(401);

    // Machine credential → discovery succeeds.
    const discovery = await machine.fetch("/api/manifest/commands");
    expect(discovery.status).toBe(200);
    const catalog = (await discovery.json()) as {
      commands: { entity: string; command: string }[];
    };
    expect(
      catalog.commands.some(
        (c) => c.entity === "Client" && c.command === "register",
      ),
    ).toBe(true);

    // Unlinked machine: spoofed claims give no tenant and no role.
    const before = (await machine.query(api.authStatus.getAuthStatus, {})) as {
      role: string;
      tenantId: string | null;
      roleSource: string;
    };
    expect(before.role).toBe("anonymous");
    expect(before.tenantId).toBeNull();
    expect(before.roleSource).toBe("anonymous");

    const denied = await post(
      machine,
      "/api/manifest/Client/commands/register",
      {
        clientType: "company",
        companyName: "Spoof Co",
        tenantId: OTHER_TENANT,
        role: "admin",
      },
    );
    expect(denied.status).toBe(400);

    // Provisioning (one-time, by a human admin): hire a Person for the
    // machine in the real tenant and link the machine id as its sign-in.
    const admin = proof.asRole({
      subject: "user_admin",
      role: "admin",
      tenantId: TENANT,
    });
    await proof.executeCommand(admin, api.mutations.Person_createViaHire, {
      givenName: "Remote",
      familyName: "Agent",
      email: "remote-agent@example.com",
      role: "sales_manager",
      authSubjectId: MACHINE_SUBJECT,
    });

    // Linked machine: tenant + role come from the Person row, not the token.
    const after = (await machine.query(api.authStatus.getAuthStatus, {})) as {
      role: string;
      tenantId: string | null;
      roleSource: string;
    };
    expect(after.roleSource).toBe("person");
    expect(after.role).toBe("sales_manager");
    expect(after.tenantId).toBe(TENANT);

    // One governed command executes; body identity keys are ignored.
    const created = await post(
      machine,
      "/api/manifest/Client/commands/register",
      {
        clientType: "company",
        companyName: "Machine Client",
        tenantId: OTHER_TENANT,
        role: "admin",
        idempotencyKey: "machine-auth:client:1",
      },
    );
    expect(created.status).toBe(200);
    const docId = (created.json.data as { docId: string }).docId;
    const rows = await proof.expectDocuments(
      admin,
      "clients",
      (doc) => doc._id === docId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenantId).toBe(TENANT);
  });
});
