// @vitest-environment edge-runtime
/**
 * AC-453 (PL-CULINARY-CATALOG, BE-9.6-recipe-richness): a recipe carries
 * equipment, plating, cooling, holding and reheating standards, approved
 * swaps, a video link and a photo. They can be corrected on a published
 * recipe without a new edition, and every field nobody wrote reads
 * "Not on file" on the recipe page.
 */
import { convexTest } from "convex-test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { modules } from "../proofs/convex-test-modules";

let equipmentList: unknown[] | undefined;
vi.mock("../../src/lib/manifest-convex-react", () => ({
  useListEquipment: () => equipmentList,
  useComponentSetKitchenStandards: () => async () => null,
  useComponentSetPrimaryImage: () => async () => null,
  useComponentClearPrimaryImage: () => async () => null,
  useCreateAttachment: () => async () => null,
  useAttachmentRemove: () => async () => null,
}));
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useMutation: () => async () => null,
  useQuery: () => undefined,
}));

const { ComponentKitchenStandardsPanel, kitchenStandards, NOT_ON_FILE } =
  await import("../../src/features/kitchen/ComponentKitchenStandardsPanel");

const TENANT = "tenant-recipe-standards";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Row = Record<string, unknown> & {
  _id: string;
  version: number;
  name: string;
};

const render = (row: Row) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(ComponentKitchenStandardsPanel, {
        component: row,
        onFailure: () => {},
      }),
    ),
  );

describe("AC-453 recipe media and holding standards", () => {
  it("a component can carry plating and cooling/holding/reheat instructions and photos, all absent fields render as explicitly not on file", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const kitchen = proof.asRole({
      subject: "chef-standards",
      role: "kitchen_manager",
      tenantId: TENANT,
    });
    const read = async (id: string) =>
      (await kitchen.run(async (ctx) => ctx.db.get(id as never))) as Row;

    const { docId } = (await proof.executeCommand(
      kitchen,
      api.mutations.Component_createViaDraft,
      {
        name: "Braised short rib",
        yieldQuantity: 20,
        yieldUnit: "portion",
        instructions: "Sear, braise 3 hours at 300°F.",
      },
    )) as { docId: string };
    let row = await read(docId);
    await proof.executeCommand(
      kitchen,
      api.mutations.Component_publishVersion,
      {
        docId,
        version: row.version,
      },
    );

    // Nothing on file yet: every standard and the photo say so.
    row = await read(docId);
    expect(kitchenStandards(row).every((s) => s.value == null)).toBe(true);
    const empty = render(row);
    expect(empty).toContain("0 of 7 on file");
    expect(empty).toContain(`Photo: ${NOT_ON_FILE}`);
    expect(empty.match(new RegExp(NOT_ON_FILE, "g"))?.length).toBe(8);

    // Standards are station facts: set on the published recipe, same edition.
    await proof.executeCommand(
      kitchen,
      api.mutations.Component_setKitchenStandards,
      {
        docId,
        version: row.version,
        equipmentNotes: "Rondeau, hotel pans",
        platingInstructions: "Two pieces over polenta, jus on top",
        coolingInstructions: "Ice bath to 70°F in 2 hours, 41°F in 4 more",
        holdingInstructions: "Hold in braising liquid at 140°F or above",
        reheatInstructions: "Covered in 325°F oven to 165°F",
        videoUrl: "https://example.com/short-rib",
      },
    );
    row = await read(docId);
    await proof.executeCommand(
      kitchen,
      api.mutations.Component_setPrimaryImage,
      {
        docId,
        version: row.version,
        storageId: "kg2photo",
        fileName: "short-rib.jpg",
      },
    );
    row = await read(docId);
    expect(row.status).toBe("published");
    expect(row.versionNumber).toBe(1);
    expect(row).toMatchObject({
      platingInstructions: "Two pieces over polenta, jus on top",
      coolingInstructions: "Ice bath to 70°F in 2 hours, 41°F in 4 more",
      holdingInstructions: "Hold in braising liquid at 140°F or above",
      reheatInstructions: "Covered in 325°F oven to 165°F",
      primaryImageStorageId: "kg2photo",
      primaryImageFileName: "short-rib.jpg",
    });

    const filled = render(row);
    expect(filled).toContain("6 of 7 on file");
    expect(filled).toContain("Two pieces over polenta, jus on top");
    expect(filled).toContain('href="https://example.com/short-rib"');
    expect(filled).not.toContain(`Photo: ${NOT_ON_FILE}`);
    // The one standard nobody wrote still says so.
    const swaps = kitchenStandards(row).find(
      (s) => s.key === "substitutionNotes",
    );
    expect(swaps?.value).toBeNull();
    expect(filled.match(new RegExp(NOT_ON_FILE, "g"))?.length).toBe(1);

    // A blank save clears back to not on file; clearing the photo works too.
    await proof.executeCommand(
      kitchen,
      api.mutations.Component_setKitchenStandards,
      { docId, version: row.version },
    );
    row = await read(docId);
    await proof.executeCommand(
      kitchen,
      api.mutations.Component_clearPrimaryImage,
      { docId, version: row.version },
    );
    row = await read(docId);
    expect(kitchenStandards(row).every((s) => s.value == null)).toBe(true);
    expect(row.primaryImageStorageId ?? null).toBeNull();
  });

  it("a chef reads the company equipment list, and recipe equipment on that list says how many the kitchen has", async () => {
    const proof = createManifestTestContext({
      convexTest: convexTest as never,
      schema,
      modules,
    });
    const inventory = proof.asRole({
      subject: "stock-lead",
      role: "inventory_manager",
      tenantId: TENANT,
    });
    await proof.executeCommand(
      inventory,
      api.mutations.Equipment_createViaRegister,
      {
        name: "Rondeau",
        assetTag: "RND-1",
        category: "Cookware",
        ownership: "owned",
        quantity: 6,
      },
    );
    const kitchen = proof.asRole({
      subject: "chef-standards",
      role: "kitchen_manager",
      tenantId: TENANT,
    });
    const seen = (await kitchen.query(api.queries.listEquipment, {})) as {
      name: string;
    }[];
    expect(seen.map((item) => item.name)).toEqual(["Rondeau"]);
    const other = proof.asRole({
      subject: "chef-elsewhere",
      role: "kitchen_manager",
      tenantId: "tenant-other-kitchen",
    });
    expect(await other.query(api.queries.listEquipment, {})).toEqual([]);

    equipmentList = seen;
    const page = render({
      _id: "c1",
      version: 1,
      name: "Braised short rib",
      equipmentNotes: "rondeau, hotel pans",
    });
    expect(page).toContain('href="/facilities/equipment"');
    expect(page).toContain("6 each on hand");
    expect(page).toContain("hotel pans");
    expect(page).toContain("Add from the equipment list");
    equipmentList = undefined;
  });
});
