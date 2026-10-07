/**
 * Old-system catering packages (PL-SOURCE-DATASETS, AC-057 "catalog ...
 * packages"): each package of the Menu Item Packages report becomes a draft
 * menu "Old system package - <name>" with its dishes.
 *
 *   - each dish joins the one dish of that name already in Capsule; its
 *     course is the package's choice group, and "select 1" groups become the
 *     menu's pick-one courses
 *   - a name with no dish, or with two dishes, is sent back to be listed
 *   - group notes and groups with no dishes go in the menu description
 *   - reading the file again adds nothing; a dish added since is put on the
 *     draft once; a menu someone published is left as it is
 *   - a person who may not make menus cannot bring packages in
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { OldMenuPackage } from "../../src/lib/tppReports/parseMenuPackages";
import {
  harness,
  rolesFor,
  runner,
} from "./buyer-qty-override-survival.runtime.helpers";

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

const TENANT = "tenant-tpp-menu-packages";

const HAM: OldMenuPackage = {
  name: "Traditional Option 3 - Glazed Ham",
  description: "A classic buffet.",
  groups: [
    {
      label: "Protein",
      note: "",
      pickOne: false,
      dishes: ["Honey Glazed Ham"],
    },
    { label: "Starch", note: "", pickOne: false, dishes: ["Mac n Cheese"] },
    {
      label: "Salad (select 1)",
      note: "",
      pickOne: true,
      dishes: [
        "Mixed Green Salad with Ranch Dressing",
        "Mixed Green Salad with Italian Dressing",
      ],
    },
    {
      label: "Roll",
      note: "Warm from the oven",
      pickOne: false,
      dishes: ["Fresh Baked Dinner Rolls with Butter"],
    },
    {
      label: "No modifications available for this station.",
      note: "",
      pickOne: false,
      dishes: [],
    },
  ],
};

type Result = {
  added: number;
  updated: number;
  unchanged: number;
  lines: number;
  leftAlone: string[];
  notFound: string[];
  several: string[];
};

describe("runtime proof: old-system menu packages", () => {
  it("makes one draft menu per package with its dishes, once", async () => {
    const proof = harness();
    const roles = rolesFor(proof, TENANT);
    const kitchen = runner(proof, roles.kitchen);
    const dish = async (name: string) =>
      (
        await kitchen(api.mutations.Dish_createViaIntroduce, {
          name,
          portionSize: 1,
          portionUnit: "each",
        })
      ).docId;
    const ham = await dish("Honey Glazed Ham");
    const ranch = await dish("Mixed Green Salad with Ranch Dressing");
    const italian = await dish("Mixed Green Salad with Italian Dressing");
    await dish("Mac n Cheese");
    await dish("Mac N' Cheese");

    const bringIn = (packages: OldMenuPackage[]) =>
      roles.kitchen.mutation(api.tppMenuPackages.importTppMenuPackages, {
        packages,
      }) as Promise<Result>;
    const menus = async () =>
      ((await roles.kitchen.query(api.queries.listMenu, {})) as any[]).filter(
        (menu) => menu.deletedAt == null,
      );
    const lines = async (menuId: string) =>
      (
        (await roles.kitchen.query(api.queries.listMenuDish, {})) as any[]
      ).filter(
        (line) =>
          line.menuId === menuId &&
          line.deletedAt == null &&
          line.removedAt == null,
      );

    const first = await bringIn([HAM]);
    expect(first).toMatchObject({
      added: 1,
      updated: 0,
      unchanged: 0,
      lines: 3,
      notFound: ["Fresh Baked Dinner Rolls with Butter"],
      several: ["Mac n Cheese"],
    });
    const [menu] = await menus();
    expect(menu).toMatchObject({
      name: "Old system package - Traditional Option 3 - Glazed Ham",
      category: "Old system packages",
      status: "draft",
      pickOneCourses: ["Salad (select 1)"],
    });
    expect(menu.description).toContain("A classic buffet.");
    expect(menu.description).toContain("Roll: Warm from the oven");
    expect(menu.description).toContain(
      "No modifications available for this station.",
    );
    const onMenu = await lines(String(menu._id));
    expect(
      onMenu
        .map((line) => [String(line.dishId), line.course, line.sortOrder])
        .sort((a, b) => Number(a[2]) - Number(b[2])),
    ).toEqual([
      [String(ham), "Protein", 1],
      [String(ranch), "Salad (select 1)", 3],
      [String(italian), "Salad (select 1)", 4],
    ]);

    expect(await bringIn([HAM])).toMatchObject({
      added: 0,
      updated: 0,
      unchanged: 1,
      lines: 0,
    });
    const rolls = await dish("Fresh Baked Dinner Rolls with Butter");
    expect(await bringIn([HAM])).toMatchObject({
      updated: 1,
      lines: 1,
      notFound: [],
    });
    expect(
      (await lines(String(menu._id))).map((l) => String(l.dishId)),
    ).toContain(String(rolls));
    expect(await menus()).toHaveLength(1);

    await kitchen(api.mutations.Menu_markPublished, { docId: menu._id });
    expect(await bringIn([HAM])).toMatchObject({
      added: 0,
      leftAlone: ["Traditional Option 3 - Glazed Ham"],
    });
    expect(await lines(String(menu._id))).toHaveLength(4);

    await expect(
      roles.inventory.mutation(api.tppMenuPackages.importTppMenuPackages, {
        packages: [{ ...HAM, name: "Steak Dinner" }],
      }),
    ).rejects.toThrow();
    expect(await menus()).toHaveLength(1);
  });
});
