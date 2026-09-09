const associationPlaceholder = /\s*-\s*Show Association\s*$/i;

/** TPP's exported button label is not an instruction for the packing crew. */
export function packingItemDescription(description: string): string {
  return (
    description.replace(associationPlaceholder, "").trim() || "Packing item"
  );
}

export function packingAssociationMissing(description: string): boolean {
  return associationPlaceholder.test(description);
}
