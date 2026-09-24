import { WiringTransportError } from "@angriff36/manifest/projections/wiring";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReference } from "convex/server";
import { api } from "../lib/api";
import { CapsuleAgentAuthManager } from "./CapsuleAgentAuthManager";
import { CapsuleCommandArgsNormalizer } from "./CapsuleCommandArgsNormalizer";
import { CapsuleCommandCatalog } from "./CapsuleCommandCatalog";
import type { CapsuleCommandDescriptor } from "./CapsuleCommandCatalog";
import { CapsuleCommandSeamRoutes } from "./CapsuleCommandSeamRoutes";
import { CapsuleGeneratedCommandGateway } from "./CapsuleGeneratedCommandGateway";
import type {
  CapsuleCommandExecutor,
  CapsuleCommandInvocation,
} from "./CapsuleCommandExecutor";

type AnyMutationRef = FunctionReference<"mutation">;

/**
 * Live executor: generated wiring consumer → canonical command route.
 * Special seams stay on their existing Convex calls.
 * Auth/URL resolve lazily so MCP tool discovery can succeed before a write.
 * JWT is refreshed on every execute (Clerk session tokens expire in ~60s).
 */
export class ConvexCommandClient implements CapsuleCommandExecutor {
  private client: ConvexHttpClient | null = null;
  private readonly auth: CapsuleAgentAuthManager;
  private readonly catalog: CapsuleCommandCatalog;
  private readonly argsNormalizer: CapsuleCommandArgsNormalizer;
  private readonly seamRoutes: CapsuleCommandSeamRoutes;
  private readonly gateway: CapsuleGeneratedCommandGateway;

  constructor(
    auth: CapsuleAgentAuthManager = new CapsuleAgentAuthManager(),
    catalog: CapsuleCommandCatalog = new CapsuleCommandCatalog(),
    argsNormalizer: CapsuleCommandArgsNormalizer = new CapsuleCommandArgsNormalizer(),
    seamRoutes: CapsuleCommandSeamRoutes = new CapsuleCommandSeamRoutes(),
    gateway: CapsuleGeneratedCommandGateway = new CapsuleGeneratedCommandGateway(
      auth,
    ),
  ) {
    this.auth = auth;
    this.catalog = catalog;
    this.argsNormalizer = argsNormalizer;
    this.seamRoutes = seamRoutes;
    this.gateway = gateway;
  }

  async execute(invocation: CapsuleCommandInvocation): Promise<unknown> {
    const descriptor = this.catalog.get(invocation.capabilityId);
    const args = this.commandArgs(descriptor, invocation);
    const seam = this.seamRoutes.get(invocation.capabilityId);
    if (seam) {
      const client = await this.resolveClient();
      return client.mutation(seam.ref, seam.args(args));
    }
    return this.executeGenerated(descriptor, args);
  }

  private commandArgs(
    descriptor: CapsuleCommandDescriptor,
    invocation: CapsuleCommandInvocation,
  ): Record<string, unknown> {
    return {
      ...this.argsNormalizer.normalize(descriptor, invocation.args),
      ...(invocation.idempotencyKey
        ? { idempotencyKey: invocation.idempotencyKey }
        : {}),
    };
  }

  private async executeGenerated(
    descriptor: CapsuleCommandDescriptor,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      return await this.gateway.execute(descriptor.capabilityId, args);
    } catch (error: unknown) {
      if (
        error instanceof WiringTransportError &&
        error.code === "not_dispatchable"
      ) {
        return this.executeMutation(descriptor, args);
      }
      throw error;
    }
  }

  private async executeMutation(
    descriptor: CapsuleCommandDescriptor,
    args: Record<string, unknown>,
  ): Promise<unknown> {
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
