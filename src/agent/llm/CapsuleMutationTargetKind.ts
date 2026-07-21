/**
 * Classifies Convex mutation targets for agent/LLM argument shapes.
 * createVia* creates a new row (no docId). Other mapped commands act on docId.
 */
export class CapsuleMutationTargetKind {
  static requiresDocumentId(mutationName: string): boolean {
    return !mutationName.includes("createVia");
  }
}
