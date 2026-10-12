/**
 * Runtime proof: a catering-book package kept as a menu in the catalog
 * (convex/lib/operationalTransactions.ts cateringPackageAsMenu), so its price
 * per guest is set once on the menu and offered under "Use template".
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { ensureTestFieldEncryptionKey } from "./test-field-encryption-key";
import { cateringPackages } from "../../src/data/cateringPackages";

beforeAll(ensureTestFieldEncryptionKey);

const TENANT = "tenant-package-menu";

describe("runtime proof: catering package as a menu", () => {
  it("makes one template menu with the package's dishes and pick-one courses", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const owner = proof.asRole({
      subject: "owner-package-menu",
      role: "owner",
      tenantId: TENANT,
    });
    await proof.executeCommand(
      owner,
      api.mutations.Organization_createViaRegister as never,
      { name: "Package kitchen" } as never,
    );
    const pack = cateringPackages.find(
      (p) => p.id === "wedding-traditional-buffet",
    )!;
    const asMenu = (api.lib as never as Record<string, Record<string, never>>)
      .operationalTransactions.cateringPackageAsMenu;
    const first = (await owner.mutation(asMenu, {
      packageId: pack.id,
    } as never)) as { menuId: string; created: boolean };
    expect(first.created).toBe(true);

    const menu = (await owner.query(api.queries.getMenu, {
      id: first.menuId as never,
    })) as {
      name: string;
      category: string;
      isTemplate: boolean;
      status: string;
      pickOneCourses: string[];
      description: string;
    };
    expect(menu).toMatchObject({
      name: "Traditional Buffet",
      category: "Catering books",
      isTemplate: true,
      status: "draft",
    });
    expect(menu.description).not.toContain("[catering-package:");
    expect(menu.pickOneCourses.length).toBeGreaterThan(0);

    const lines = (
      (await owner.query(api.queries.listMenuDishByMenuId, {
        menuId: first.menuId,
      } as never)) as { deletedAt: number | null }[]
    ).filter((line) => line.deletedAt == null);
    const recipeCount = new Set(pack.groups.flatMap((g) => g.recipeIds)).size;
    expect(lines.length).toBe(recipeCount);

    // Asking again opens the same menu.
    const again = (await owner.mutation(asMenu, {
      packageId: pack.id,
    } as never)) as { menuId: string; created: boolean };
    expect(again).toEqual({ menuId: first.menuId, created: false });
  });
});
