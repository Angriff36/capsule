export interface CapsuleCommandInvocation {
  capabilityId: string;
  args: Record<string, unknown>;
  idempotencyKey?: string;
}

/**
 * Transport seam: proof harness, Convex HTTP client, or future dispatcher.
 * Always targets the same governed mutation names as the UI.
 */
export interface CapsuleCommandExecutor {
  execute(invocation: CapsuleCommandInvocation): Promise<unknown>;
}
