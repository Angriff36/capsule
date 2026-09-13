import type { ConvexReactClient } from "convex/react";
import type { FunctionReference } from "convex/server";
import { api } from "../lib/api";
import { CapsuleCommandArgsNormalizer } from "./CapsuleCommandArgsNormalizer";
import { CapsuleCommandCatalog } from "./CapsuleCommandCatalog";
import type {
  CapsuleCommandExecutor,
  CapsuleCommandInvocation,
} from "./CapsuleCommandExecutor";

type AnyMutationRef = FunctionReference<"mutation">;

/**
 * Browser twin of `ConvexCommandClient`: the signed-in user's own
 * `ConvexReactClient` (Clerk session already attached) running the same
 * generated `api.mutations.*` through the same capability catalog the MCP
 * host uses. This is what lets the BEO import review screen execute an
 * event-bundle plan in place, with the same idempotency scope as the agent.
 */
export class BrowserCommandExecutor implements CapsuleCommandExecutor {
  private readonly catalog = new CapsuleCommandCatalog();
  private readonly argsNormalizer = new CapsuleCommandArgsNormalizer();

  constructor(private readonly client: ConvexReactClient) {}

  async execute(invocation: CapsuleCommandInvocation): Promise<unknown> {
    const descriptor = this.catalog.get(invocation.capabilityId);
    const mutationTable = api.mutations as unknown as Record<
      string,
      AnyMutationRef
    >;
    const ref = mutationTable[descriptor.mutationName];
    if (!ref) {
      throw new Error(
        `Generated API missing mutation '${descriptor.mutationName}'.`,
      );
    }
    const args = {
      ...this.argsNormalizer.normalize(descriptor, invocation.args),
      ...(invocation.idempotencyKey
        ? { idempotencyKey: invocation.idempotencyKey }
        : {}),
    };
    return this.client.mutation(ref, args);
  }
}
