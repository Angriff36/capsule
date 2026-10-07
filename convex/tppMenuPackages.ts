/**
 * AUTHOR SEAM - the old system's catering packages from its Menu Item
 * Packages report (PL-SOURCE-DATASETS, AC-057 "catalog ... packages").
 *
 * The page reads the report (src/lib/tppReports/parseMenuPackages.ts) and
 * sends the packages. Each becomes a draft menu "Old system package - <name>"
 * with its dishes on it, each dish's course the package's choice group, and
 * the "select 1" groups as the menu's pick-one courses. A dish is joined to
 * the one dish of that name already in Capsule (the Menu Items Export brought
 * them in); of two dishes with one name, the one that import made. A name
 * with no dish, or still more than one, is sent back so the page can list it. A draft is never on the public menu or the proposal
 * picker, so a manager checks the package and publishes it.
 *
 * Reading the file again: a package menu still in draft gets only the dishes
 * it is missing; one someone published or archived is left as it is. Every
 * write goes through the generated Menu and MenuDish commands, so their role
 * and tenant checks still apply.
 */
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { plainName } from "./importClientByName";
import { getAuthContext, requireTenant } from "./lib/authContext";

export const OLD_PACKAGE_MENU = "Old system package - ";

/**
 * Pick the one dish a printed name means: the main dish over its versions,
 * then the dish the old system's menu import made over one made by hand.
 */
function dishByName(
  dishes: Doc<"dishes">[],
  fromOldSystem: () => Promise<Set<string>>,
) {
  const byName = new Map<string, Doc<"dishes">[]>();
  for (const dish of dishes) {
    const key = plainName(dish.name);
    byName.set(key, [...(byName.get(key) ?? []), dish]);
  }
  return async (name: string): Promise<Doc<"dishes"> | "none" | "several"> => {
    const all = byName.get(plainName(name)) ?? [];
    const main = all.filter(
      (dish) => dish.versionOfDishId == null && dish.canonicalDishId == null,
    );
    const pick = main.length > 0 ? main : all;
    if (pick.length === 0) return "none";
    if (pick.length === 1) return pick[0]!;
    const linked = await fromOldSystem();
    const old = pick.filter((dish) => linked.has(String(dish._id)));
    return old.length === 1 ? old[0]! : "several";
  };
}

export const importTppMenuPackages = mutation({
  args: {
    packages: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        groups: v.array(
          v.object({
            label: v.string(),
            note: v.string(),
            pickOne: v.boolean(),
            dishes: v.array(v.string()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    // Read only when two dishes share a printed name.
    let oldDishIds: Set<string> | null = null;
    const findDish = dishByName(
      (
        await ctx.db
          .query("dishes")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .collect()
      ).filter(
        (dish) =>
          dish.deletedAt == null &&
          dish.mergedIntoDishId == null &&
          dish.status === "active",
      ),
      async () => {
        oldDishIds ??= new Set(
          (
            await ctx.db
              .query("externalRecordLinks")
              .withIndex("by_tenantId_and_recordType", (q) =>
                q.eq("tenantId", tenantId).eq("recordType", "menu"),
              )
              .collect()
          )
            // Older imports labelled the dish link "menu"; both are the dish.
            .filter(
              (link) =>
                link.deletedAt == null &&
                link.sourceSystem === "tpp_legacy" &&
                link.capsuleId !== "",
            )
            .map((link) => link.capsuleId),
        );
        return oldDishIds;
      },
    );
    const menus = new Map(
      (
        await ctx.db
          .query("menus")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .collect()
      )
        .filter((menu) => menu.deletedAt == null)
        .map((menu) => [plainName(menu.name), menu]),
    );

    let added = 0;
    let updated = 0;
    let unchanged = 0;
    let lines = 0;
    const leftAlone: string[] = [];
    const notFound = new Set<string>();
    const several = new Set<string>();

    for (const pack of args.packages) {
      const name = `${OLD_PACKAGE_MENU}${pack.name.trim()}`;
      const existing = menus.get(plainName(name));
      if (existing && existing.status !== "draft") {
        leftAlone.push(pack.name);
        continue;
      }
      const notes = pack.groups
        .filter((group) => group.note !== "" || group.dishes.length === 0)
        .map((group) =>
          [group.label, group.note].filter((part) => part !== "").join(": "),
        );
      const menuId: string = existing
        ? String(existing._id)
        : (
            (await ctx.runMutation(api.mutations.Menu_createViaDraft, {
              name,
              category: "Old system packages",
              description: [
                pack.description,
                ...notes,
                "From the old system's package list. Check it, set the price, then publish this menu to quote from it.",
              ]
                .filter((part) => part !== "")
                .join("\n"),
            })) as { docId: string }
          ).docId;
      const onMenu = new Set(
        existing
          ? (
              await ctx.db
                .query("menuDishes")
                .withIndex("by_menuId", (q) => q.eq("menuId", existing._id))
                .collect()
            )
              .filter(
                (line) => line.deletedAt == null && line.removedAt == null,
              )
              .map((line) => String(line.dishId))
          : [],
      );

      let sortOrder = 0;
      let newLines = 0;
      for (const group of pack.groups) {
        for (const dishName of group.dishes) {
          sortOrder += 1;
          const dish = await findDish(dishName);
          if (dish === "none") notFound.add(dishName);
          if (dish === "several") several.add(dishName);
          if (typeof dish === "string" || onMenu.has(String(dish._id)))
            continue;
          await ctx.runMutation(api.mutations.MenuDish_createViaAdd, {
            menuId,
            dishId: String(dish._id),
            sortOrder,
            course: group.label || undefined,
          });
          onMenu.add(String(dish._id));
          newLines += 1;
        }
      }
      lines += newLines;

      const pickOne = pack.groups
        .filter((group) => group.pickOne && group.dishes.length > 1)
        .map((group) => group.label);
      const had = existing?.pickOneCourses ?? [];
      const pickOneCourses = [...new Set([...had, ...pickOne])];
      if (pickOneCourses.length > had.length) {
        try {
          await ctx.runMutation(api.mutations.Menu_setService, {
            docId: menuId as Id<"menus">,
            guestsPerServer: existing?.guestsPerServer ?? undefined,
            pickOneCourses,
          });
        } catch {
          // Only a kitchen manager sets pick-one courses; the dishes still land.
        }
      }

      if (!existing) added += 1;
      else if (newLines > 0) updated += 1;
      else unchanged += 1;
    }

    return {
      added,
      updated,
      unchanged,
      lines,
      leftAlone,
      notFound: [...notFound].sort(),
      several: [...several].sort(),
    };
  },
});
