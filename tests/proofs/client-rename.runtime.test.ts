/**
 * A client's name and type can be fixed after registration (a typo, or a
 * person registered as a company).
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("client rename", () => {
  it("turns a company client into a named person, and refuses a blank name", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const sales = proof.asRole({
      subject: "rename-sales",
      role: "sales_manager",
      tenantId: "tenant-client-rename",
    });
    const clientId = (
      (await proof.executeCommand(
        sales,
        api.mutations.Client_createViaRegister,
        {
          clientType: "company",
          companyName: "Priya Raman",
        },
      )) as { docId: string }
    ).docId;

    await proof.executeCommand(sales, api.mutations.Client_rename, {
      docId: clientId,
      version: 1,
      clientType: "person",
      givenName: "Priya",
      familyName: "Raman",
    });
    const row = (await sales.run(async (ctx) =>
      ctx.db.get(clientId as never),
    )) as Record<string, unknown>;
    expect(row).toMatchObject({
      clientType: "person",
      givenName: "Priya",
      familyName: "Raman",
    });
    expect(row.companyName ?? null).toBeNull();

    await expect(
      proof.executeCommand(sales, api.mutations.Client_rename, {
        docId: clientId,
        version: 2,
        clientType: "person",
        givenName: " ",
      }),
    ).rejects.toThrow();
  });
});
