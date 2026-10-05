/**
 * Runtime proof (AC-240, AC-241 menu leg; CF-4-2): the anonymous public menu
 * shows published menus with the sell price in force today, categories,
 * descriptions, dietary and allergen labels, guest minimums, service style,
 * season and "starting at" pricing — and nothing private (kitchen recipe,
 * line instructions, draft menus, another company's menus).
 *
 * The public price for a dish is the same price a proposal line must use:
 * sending a proposal at the public price passes the catalog check and
 * freezes that price as its catalog price.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const M = api.mutations;
const DAY = 24 * 60 * 60 * 1000;
const PRIVATE = ["PRIVATE-RECIPE-STEP", "PRIVATE-LINE-NOTE", "Draft secret"];

function harness() {
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
type Proof = ReturnType<typeof harness>;
type Actor = ReturnType<Proof["asRole"]>;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function dish(owner: Actor, proof: Proof, name: string) {
  return (await proof.executeCommand(owner, M.Dish_createViaIntroduce, {
    name,
    portionSize: 1,
    portionUnit: "serving",
    description: `${name}, served warm`,
    course: "Main",
    dietaryTags: ["Gluten free"],
    allergenSummary: ["milk", "tree_nuts"],
  })) as { docId: string };
}

async function seedCatalog(proof: Proof, tenantId: string) {
  const owner = proof.asRole({
    subject: `o-${tenantId}`,
    role: "owner",
    tenantId,
  });
  await owner.run(async (ctx) => {
    await ctx.db.insert("organizations", {
      tenantId,
      name: "Harvest Catering",
      status: "active",
      version: 1,
    });
  });
  const menu = (await proof.executeCommand(owner, M.Menu_createViaDraft, {
    name: "Autumn wedding",
    description: "Family-style autumn dinner",
    category: "Weddings",
    basePrice: 500,
    pricePerPerson: 42,
    minGuests: 50,
    maxGuests: 200,
  })) as { docId: string };
  const rib = await dish(owner, proof, "Braised short rib");
  const tart = await dish(owner, proof, "Pear tart");
  await owner.run(async (ctx) => {
    await ctx.db.patch(rib.docId as never, {
      recipeInstructions: "PRIVATE-RECIPE-STEP",
    });
  });
  const ribLine = (await proof.executeCommand(owner, M.MenuDish_createViaAdd, {
    menuId: menu.docId,
    dishId: rib.docId,
    sellingPrice: 48,
    serviceStyle: "Family style",
    specialInstructions: "PRIVATE-LINE-NOTE",
  })) as { docId: string };
  await proof.executeCommand(owner, M.MenuDish_createViaAdd, {
    menuId: menu.docId,
    dishId: tart.docId,
    sortOrder: 1,
  });
  const menuRow = ((await owner.query(api.queries.listMenu, {})) as any[]).find(
    (m) => m._id === menu.docId,
  );
  await proof.executeCommand(owner, M.Menu_setSeason, {
    docId: menu.docId,
    version: menuRow.version,
    availableFrom: Date.UTC(2026, 8, 1),
    availableUntil: Date.UTC(2026, 10, 30),
  });
  await proof.executeCommand(owner, M.Menu_markPublished, {
    docId: menu.docId,
  });
  // A draft menu is not public.
  await proof.executeCommand(owner, M.Menu_createViaDraft, {
    name: "Draft secret",
  });
  // Planned for tomorrow: the public menu still shows today's price.
  const line = (
    (await owner.query(api.queries.listMenuDish, {})) as any[]
  ).find((row) => row._id === ribLine.docId);
  await proof.executeCommand(owner, M.MenuDish_schedulePriceChange, {
    docId: ribLine.docId,
    version: line.version,
    sellingPrice: 60,
    effectiveAt: Date.now() + DAY,
  });
  return { owner, menuId: menu.docId, ribLineId: ribLine.docId };
}

describe("public menu shows effective sell prices and nothing private (AC-240)", () => {
  it("lists published menus with client-facing detail only", async () => {
    const proof = harness();
    const { menuId, ribLineId } = await seedCatalog(proof, "tenant-menu-a");

    const menus = (await proof.anonymous.query(
      api.publicMenu.getPublicMenu,
      {},
    )) as any[];
    expect(menus).toHaveLength(1);
    const [menu] = menus;
    expect(menu).toMatchObject({
      menuId,
      name: "Autumn wedding",
      description: "Family-style autumn dinner",
      category: "Weddings",
      price: { kind: "starting_at", from: 500, perPerson: 42 },
      minGuests: 50,
      maxGuests: 200,
      availableFrom: Date.UTC(2026, 8, 1),
      availableUntil: Date.UTC(2026, 10, 30),
      notAvailableBecause: [],
    });
    expect(menu.dishes).toEqual([
      {
        menuDishId: ribLineId,
        name: "Braised short rib",
        description: "Braised short rib, served warm",
        course: "Main",
        serviceStyle: "Family style",
        dietaryTags: ["Gluten free"],
        allergens: ["milk", "tree_nuts"],
        price: 48,
      },
      expect.objectContaining({ name: "Pear tart", price: null }),
    ]);
    const text = JSON.stringify(menus);
    for (const secret of PRIVATE) expect(text).not.toContain(secret);
    for (const key of ["cost", "margin", "tenantId", "recipe"]) {
      expect(text.toLowerCase()).not.toContain(key.toLowerCase());
    }
  });

  it("says why a menu does not fit the event date or guest count", async () => {
    const proof = harness();
    await seedCatalog(proof, "tenant-menu-b");
    const [outOfSeason] = (await proof.anonymous.query(
      api.publicMenu.getPublicMenu,
      { eventDate: Date.UTC(2027, 1, 14), guestCount: 20 },
    )) as any[];
    expect(outOfSeason.notAvailableBecause).toEqual([
      "Not offered on this date",
      "Needs at least 50 guests",
    ]);
    const [fits] = (await proof.anonymous.query(api.publicMenu.getPublicMenu, {
      eventDate: Date.UTC(2026, 9, 10),
      guestCount: 120,
    })) as any[];
    expect(fits.notAvailableBecause).toEqual([]);
  });

  it("uses the same price a proposal line must match (AC-241 menu leg)", async () => {
    const proof = harness();
    const { owner, ribLineId } = await seedCatalog(proof, "tenant-menu-c");
    const [menu] = (await proof.anonymous.query(
      api.publicMenu.getPublicMenu,
      {},
    )) as any[];
    const publicPrice = menu.dishes[0].price as number;

    const client = (await proof.executeCommand(
      owner,
      M.Client_createViaRegister,
      { clientType: "company", companyName: "Menu match client" },
    )) as { docId: string };
    await owner.mutation(
      (api.lib as any).proposalDraft.draftProposalWithLines,
      {
        clientId: client.docId,
        title: "At the public price",
        guestCount: 1,
        subtotal: publicPrice,
        taxAmount: 0,
        discountAmount: 0,
        total: publicPrice,
        lines: [
          {
            description: "Braised short rib",
            pricingBasis: "flat",
            unitPrice: publicPrice,
            quantity: 1,
            menuDishId: ribLineId,
          },
        ],
      },
    );
    const [proposal] = (await owner.query(
      api.queries.listProposal,
      {},
    )) as any[];
    await owner.mutation(
      (api.lib as any).proposalRevision.sendProposalWithRevisionCapture,
      { docId: proposal._id, version: proposal.version },
    );
    const [revision] = (await owner.query(
      api.queries.listProposalRevisionByProposalId,
      { proposalId: proposal._id },
    )) as any[];
    expect(JSON.parse(revision.snapshot).lineItems[0]).toMatchObject({
      unitPrice: publicPrice,
      catalogPrice: publicPrice,
    });
  });

  it("lists allergens from the dish's recipe, not only the ones typed on the dish", async () => {
    const proof = harness();
    const { owner } = await seedCatalog(proof, "tenant-menu-e");
    const ribId = ((await owner.query(api.queries.listDish, {})) as any[]).find(
      (row) => row.name === "Braised short rib",
    )._id;
    const egg = (await proof.executeCommand(
      owner,
      M.Ingredient_createViaIntroduce,
      { name: "Egg yolk", unit: "cup", costPerUnit: 1, allergens: ["eggs"] },
    )) as { docId: string };
    const sauce = (await proof.executeCommand(
      owner,
      M.Component_createViaDraft,
      { name: "Gravy", yieldQuantity: 1, yieldUnit: "gallon" },
    )) as { docId: string };
    await proof.executeCommand(owner, M.Component_setDeclaredAllergens, {
      docId: sauce.docId,
      declaredAllergens: ["wheat"],
    });
    await proof.executeCommand(owner, M.ComponentIngredient_createViaAdd, {
      componentId: sauce.docId,
      ingredientId: egg.docId,
      quantity: 1,
      unit: "cup",
    });
    await proof.executeCommand(owner, M.DishComponent_createViaAttach, {
      dishId: ribId,
      componentId: sauce.docId,
      yieldQuantity: 1,
    });
    const [menu] = (await proof.anonymous.query(
      api.publicMenu.getPublicMenu,
      {},
    )) as any[];
    const rib = menu.dishes.find(
      (row: any) => row.name === "Braised short rib",
    );
    expect(rib.allergens).toEqual(["milk", "eggs", "tree_nuts", "wheat"]);
    const tart = menu.dishes.find((row: any) => row.name === "Pear tart");
    expect(tart.allergens).toEqual(["milk", "tree_nuts"]);
  });

  it("heads the printed menu with the Branding name and address only", async () => {
    const proof = harness();
    const { owner } = await seedCatalog(proof, "tenant-menu-f");
    expect(
      await proof.anonymous.query(api.publicMenu.getPublicMenuCompany, {}),
    ).toEqual({ name: "Harvest Catering", address: null, logoUrl: null });
    await owner.run(async (ctx) => {
      const [org] = await ctx.db.query("organizations").collect();
      await ctx.db.patch(org!._id as never, {
        brandDisplayName: "Harvest Co.",
        brandAddress: "1 Main St, Spokane",
        emailReplyTo: "PRIVATE-REPLY@example.com",
      });
    });
    expect(
      await proof.anonymous.query(api.publicMenu.getPublicMenuCompany, {}),
    ).toEqual({
      name: "Harvest Co.",
      address: "1 Main St, Spokane",
      logoUrl: null,
    });
  });

  it("shows another company nothing", async () => {
    const proof = harness();
    await seedCatalog(proof, "tenant-menu-d");
    const other = proof.asRole({
      subject: "o-other",
      role: "owner",
      tenantId: "tenant-menu-other",
    });
    await proof.executeCommand(other, M.Menu_createViaDraft, {
      name: "Other company menu",
    });
    const text = JSON.stringify(
      await proof.anonymous.query(api.publicMenu.getPublicMenu, {}),
    );
    expect(text).not.toContain("Other company menu");
  });
});
