import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference } from "convex/server";
import { api } from "../lib/api";
import { CapsuleAgentAuthManager } from "./CapsuleAgentAuthManager";
import { CapsuleCommandCatalog } from "./CapsuleCommandCatalog";
import type {
  CapsuleCommandExecutor,
  CapsuleCommandInvocation,
} from "./CapsuleCommandExecutor";

type AnyMutationRef = FunctionReference<"mutation">;

/**
 * Live executor: ConvexHttpClient + Clerk JWT → same api.mutations.* as the UI.
 */
export class ConvexCommandClient implements CapsuleCommandExecutor {
  private readonly client: ConvexHttpClient;
  private readonly catalog: CapsuleCommandCatalog;

  constructor(
    auth: CapsuleAgentAuthManager = new CapsuleAgentAuthManager(),
    catalog: CapsuleCommandCatalog = new CapsuleCommandCatalog(),
  ) {
    this.catalog = catalog;
    this.client = new ConvexHttpClient(auth.resolveConvexUrl());
    this.client.setAuth(auth.requireJwt());
  }

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
      ...invocation.args,
      ...(invocation.idempotencyKey
        ? { idempotencyKey: invocation.idempotencyKey }
        : {}),
    };
    return this.client.mutation(ref, args);
  }
}
