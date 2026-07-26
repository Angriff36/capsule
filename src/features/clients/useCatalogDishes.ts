import {
  useListDish,
  useListMenu,
  useListMenuDish,
} from "../../lib/manifest-convex-react";

// A catalog dish a proposal pricing line can be linked to (spec §5.4 L276). A
// published menu's active dishes, each carrying its `sellingPrice` — the
// catalog unit price an override is audited against. Mirrors the
// `catalogLines` filter in ProposalMenuSelectionPanel (the published-catalog
// definition of truth) so proposal pricing and client menu selection agree.

export interface CatalogDish {
  /** MenuDish id — the catalog line a ProposalLineItem.menuDishId pins. */
  menuDishId: string;
  dishId: string;
  menuId: string;
  /** MenuDish.sellingPrice — null when the dish has no published price. */
  sellingPrice: number | null;
  name: string;
}

export function useCatalogDishes(): {
  loading: boolean;
  lines: CatalogDish[];
} {
  const menus = useListMenu();
  const menuDishes = useListMenuDish();
  const dishes = useListDish();

  if (menus === undefined || menuDishes === undefined || dishes === undefined) {
    return { loading: true, lines: [] };
  }

  const dishName = (dishId: string) =>
    String(
      (dishes ?? []).find((d) => d._id === dishId)?.name ?? "Unknown dish",
    );
  const dishStatus = (dishId: string) =>
    String((dishes ?? []).find((d) => d._id === dishId)?.status ?? "");

  const publishedMenuIds = new Set(
    (menus ?? [])
      .filter((m) => m.deletedAt == null && String(m.status) === "published")
      .map((m) => m._id),
  );

  const lines: CatalogDish[] = (menuDishes ?? [])
    .filter(
      (md) =>
        md.deletedAt == null &&
        md.addedAt != null &&
        publishedMenuIds.has(md.menuId) &&
        dishStatus(md.dishId) === "active",
    )
    .map((md) => ({
      menuDishId: md._id,
      dishId: md.dishId,
      menuId: md.menuId,
      sellingPrice: md.sellingPrice == null ? null : Number(md.sellingPrice),
      name: dishName(md.dishId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { loading: false, lines };
}
