import type { ConvexReactClient } from "convex/react";
import type { FunctionReference } from "convex/server";
import { CapsuleCommandArgsNormalizer } from "../../../agent/CapsuleCommandArgsNormalizer";
import { CapsuleCommandCatalog } from "../../../agent/CapsuleCommandCatalog";
import type {
  CapsuleCommandExecutor,
  CapsuleCommandInvocation,
} from "../../../agent/CapsuleCommandExecutor";
import { api } from "../../../lib/api";

type AnyMutationRef = FunctionReference<"mutation">;

/**
 * The signed-in user's browser as a command executor: the same generated
 * `api.mutations.*` the screens call, resolved through the same capability
 * catalog the agent uses, authenticated by the page's Clerk session. This is
 * what lets the import review screen run an event-bundle plan in place.
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
