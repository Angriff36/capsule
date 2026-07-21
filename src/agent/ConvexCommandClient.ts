import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference } from "convex/server";
import { api } from "../lib/api";
import { CapsuleAgentAuthManager } from "./CapsuleAgentAuthManager";
import { CapsuleCommandArgsNormalizer } from "./CapsuleCommandArgsNormalizer";
import { CapsuleCommandCatalog } from "./CapsuleCommandCatalog";
import type {
  CapsuleCommandExecutor,
  CapsuleCommandInvocation,
} from "./CapsuleCommandExecutor";

type AnyMutationRef = FunctionReference<"mutation">;

/**
 * Live executor: ConvexHttpClient + Clerk JWT → same api.mutations.* as the UI.
 * Auth/URL resolve lazily so MCP tool discovery can succeed before a write.
 * JWT is refreshed on every execute (Clerk session tokens expire in ~60s).
 */
export class ConvexCommandClient implements CapsuleCommandExecutor {
  private client: ConvexHttpClient | null = null;
  private readonly auth: CapsuleAgentAuthManager;
  private readonly catalog: CapsuleCommandCatalog;
  private readonly argsNormalizer: CapsuleCommandArgsNormalizer;

  constructor(
    auth: CapsuleAgentAuthManager = new CapsuleAgentAuthManager(),
    catalog: CapsuleCommandCatalog = new CapsuleCommandCatalog(),
    argsNormalizer: CapsuleCommandArgsNormalizer = new CapsuleCommandArgsNormalizer(),
  ) {
    this.auth = auth;
    this.catalog = catalog;
    this.argsNormalizer = argsNormalizer;
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
    const normalized = this.argsNormalizer.normalize(
      descriptor,
      invocation.args,
    );
    const args = {
      ...normalized,
      ...(invocation.idempotencyKey
        ? { idempotencyKey: invocation.idempotencyKey }
        : {}),
    };
    const client = await this.resolveClient();
    return client.mutation(ref, args);
  }

  private async resolveClient(): Promise<ConvexHttpClient> {
    if (!this.client) {
      this.client = new ConvexHttpClient(this.auth.resolveConvexUrl());
    }
    const jwt = await this.auth.resolveJwt();
    this.client.setAuth(jwt);
    return this.client;
  }
}
