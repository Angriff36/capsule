// Client-side menu duplication for the template library. Clones a menu's
// details, pricing, and dish lines through the governed Manifest commands.

export async function duplicateMenu(options: {
  sourceMenuId: string;
  name: string;
  isTemplate: boolean;
  operationKey: string;
  cloneMenu: (args: Record<string, unknown>) => Promise<{
    menuId: string;
    menuName: string;
    lineCount: number;
    recovered: boolean;
  }>;
}): Promise<{
  menuId: string;
  menuName: string;
  lineCount: number;
  recovered: boolean;
}> {
  return options.cloneMenu({
    sourceMenuId: options.sourceMenuId,
    name: options.name,
    isTemplate: options.isTemplate,
    operationKey: options.operationKey,
  });
}
