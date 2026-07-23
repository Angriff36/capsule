// Client-side menu duplication for the template library. Clones a menu's
// details, pricing, and dish lines through the governed Manifest commands.

type MenuSource = {
  description?: string | null;
  category?: string | null;
  basePrice: unknown;
  pricePerPerson: unknown;
  minGuests: number;
  maxGuests: number;
};

type MenuDishLine = {
  dishId: string;
  sortOrder: number;
  sellingPrice?: unknown;
  course?: string | null;
  serviceStyle?: string | null;
  specialInstructions?: string | null;
};

export async function duplicateMenu(options: {
  source: MenuSource;
  dishLines: MenuDishLine[];
  name: string;
  isTemplate: boolean;
  createMenu: (args: Record<string, unknown>) => Promise<unknown>;
  createMenuDish: (args: Record<string, unknown>) => Promise<unknown>;
}): Promise<string> {
  const { source, dishLines, name, isTemplate } = options;
  const created = (await options.createMenu({
    name,
    description: source.description ?? undefined,
    category: source.category ?? undefined,
    isTemplate,
    basePrice: Number(source.basePrice) || 0,
    pricePerPerson: Number(source.pricePerPerson) || 0,
    minGuests: source.minGuests,
    maxGuests: source.maxGuests,
  })) as { docId: string };
  for (const line of dishLines) {
    await options.createMenuDish({
      menuId: created.docId,
      dishId: line.dishId,
      sortOrder: line.sortOrder,
      sellingPrice:
        line.sellingPrice != null ? Number(line.sellingPrice) : undefined,
      course: line.course ?? undefined,
      serviceStyle: line.serviceStyle ?? undefined,
      specialInstructions: line.specialInstructions ?? undefined,
    });
  }
  return created.docId;
}
