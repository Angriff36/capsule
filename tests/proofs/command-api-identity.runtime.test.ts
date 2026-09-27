/**
 * Runtime proof (PL-AUTH, AC-151 / AC-210 / AC-372 agent-command access): the
 * command API that helper programs and agents use
 * (POST /api/manifest/<Entity>/commands/<command>) takes the workspace and
 * the person from the sign-in, never from the request body, and keeps the
 * same role and workspace rules as the screens.
 *
 * Checked: a body that names another workspace or another person is ignored
 * (the record lands in the caller's own workspace, created by the caller);
 * a caller from another workspace cannot change a record by its id; a role
 * without the right is refused; a caller with no sign-in gets 401 and
 * nothing is written. Synthetic workspaces only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

function harness() {
  // One raw instance shared with the proof-kit root, so the anonymous caller
  // and the signed-in callers see the same database.
  const anonymous = convexTest(schema, modules);
  return Object.assign(
    createManifestTestContext({
      convexTest: (() => anonymous) as never,
      schema,
      modules,
    }),
    { anonymous },
  );
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Fetcher = {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
};

async function post(
  caller: unknown,
  entity: string,
  command: string,
  body: Record<string, unknown>,
) {
  const response = await (caller as Fetcher).fetch(
    `/api/manifest/${entity}/commands/${command}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const payload = (await response.json()) as {
    data?: { docId?: string };
    error?: string;
  };
  return { status: response.status, ...payload };
}

describe("runtime proof: command API identity comes from the sign-in", () => {
  it("ignores a workspace or person named in the body and keeps workspace and role rules", async () => {
    const proof = harness();
    const home = "tenant-command-api-home";
    const other = "tenant-command-api-other";
    const sales = proof.asRole({
      subject: "command-api-sales",
      role: "sales_manager",
      tenantId: home,
    });
    const outsider = proof.asRole({
      subject: "command-api-outsider",
      role: "sales_manager",
      tenantId: other,
    });
    const driver = proof.asRole({
      subject: "command-api-driver",
      role: "driver",
      tenantId: home,
    });

    // A body that names another workspace and another person is ignored.
    const created = await post(sales, "Client", "register", {
      clientType: "company",
      companyName: "Command API client",
      tenantId: other,
      userId: "someone-else",
      actorId: "someone-else",
      user: { id: "someone-else", role: "admin", tenantId: other },
    });
    expect(created.status).toBe(200);
    const clientId = created.data?.docId as string;
    const row = (await sales.run(async (ctx) =>
      ctx.db.get(clientId as never),
    )) as { tenantId: string; companyName: string; version: number };
    expect(row.tenantId).toBe(home);
    expect(row.companyName).toBe("Command API client");

    // Another workspace cannot change the record by its id, and it is unchanged.
    const foreign = await post(outsider, "Client", "changeContact", {
      docId: clientId,
      email: "taken@example.com",
      tenantId: home,
    });
    expect(foreign.status).toBe(400);
    // (Email is stored encrypted, so the record's version shows whether it
    // was written.)
    const afterForeign = (await sales.run(async (ctx) =>
      ctx.db.get(clientId as never),
    )) as { version: number };
    expect(afterForeign.version).toBe(row.version);

    // A role without the right is refused through the API as on the screens.
    const refused = await post(driver, "Client", "register", {
      clientType: "company",
      companyName: "Driver client",
    });
    expect(refused.status).toBe(400);

    // No sign-in: 401, nothing written.
    const anonymous = await post(proof.anonymous, "Client", "register", {
      clientType: "company",
      companyName: "Anonymous client",
      tenantId: home,
    });
    expect(anonymous.status).toBe(401);
    const names = (await sales.run(async (ctx) =>
      (await ctx.db.query("clients").collect()).map(
        (client: { companyName?: string }) => client.companyName,
      ),
    )) as string[];
    expect(names).toEqual(["Command API client"]);

    // The owner of the record can still change it through the API.
    const own = await post(sales, "Client", "changeContact", {
      docId: clientId,
      email: "office@example.com",
    });
    expect(own.status).toBe(200);
    const afterOwn = (await sales.run(async (ctx) =>
      ctx.db.get(clientId as never),
    )) as { version: number };
    expect(afterOwn.version).toBe(row.version + 1);
  });
});
