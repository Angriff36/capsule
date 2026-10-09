/**
 * Pages name their own clients (byIds) and pickers search by name (search);
 * neither loads every client, and neither shows another company's clients.
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

describe("client directory by id and by name", () => {
  it("returns only the asked clients and the name matches, own company only", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const sales = proof.asRole({
      subject: "directory-sales",
      role: "sales_manager",
      tenantId: "tenant-directory-a",
    });
    const other = proof.asRole({
      subject: "directory-other",
      role: "sales_manager",
      tenantId: "tenant-directory-b",
    });
    const make = async (actor: typeof sales, companyName: string) =>
      (
        (await proof.executeCommand(
          actor,
          api.mutations.Client_createViaRegister,
          // convex-test's search fake needs every searched name field set.
          {
            clientType: "company",
            companyName,
            givenName: "Pat",
            familyName: "Lee",
          },
        )) as { docId: string }
      ).docId;
    const avista = await make(sales, "Avista Tech");
    await make(sales, "Gonzaga Alumni");
    const foreign = await make(other, "Avista Holdings");

    const named = (await sales.query(api.clientDirectory.byIds, {
      ids: [avista, foreign, "not-an-id"],
    })) as Array<{ _id: string; displayName: string; email?: unknown }>;
    expect(named.map((row) => row.displayName)).toEqual(["Avista Tech"]);
    expect(named[0]).not.toHaveProperty("email");

    const found = (await sales.query(api.clientDirectory.search, {
      text: "Avista",
    })) as Array<{ displayName: string }>;
    expect(found.map((row) => row.displayName)).toEqual(["Avista Tech"]);

    const newest = (await sales.query(api.clientDirectory.search, {
      text: "",
    })) as Array<{ displayName: string }>;
    expect(newest.map((row) => row.displayName).sort()).toEqual([
      "Avista Tech",
      "Gonzaga Alumni",
    ]);
  });
});
