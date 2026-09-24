import {
  GeneratedWiringConsumer,
  WiringCommandExecutor,
  type WiringCommandCall,
  type WiringContract,
} from "@angriff36/manifest/projections/wiring";
import wiringContract from "../generated/manifest-wiring-contract.json";
import type { CapsuleAgentAuthManager } from "./CapsuleAgentAuthManager";

const contract = wiringContract as unknown as WiringContract;

/** A command the dispatcher refused, with the generated failure kind. */
export class CapsuleGeneratedCommandFailure extends Error {
  readonly kind: string;
  readonly status: number;

  constructor(kind: string, message: string, status: number) {
    super(message);
    this.name = "CapsuleGeneratedCommandFailure";
    this.kind = kind;
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Runs a real command through GeneratedWiringConsumer.
 * Server-owned names such as tenantId are never copied into the body.
 */
export class CapsuleGeneratedCommandGateway {
  constructor(private readonly auth: CapsuleAgentAuthManager) {}

  async execute(
    capabilityId: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const consumer = this.consumer(await this.auth.resolveJwt());
    const outcome = await consumer.execute(
      capabilityId,
      this.call(consumer, capabilityId, args),
    );
    if (outcome.ok) {
      return outcome.data;
    }
    throw new CapsuleGeneratedCommandFailure(
      outcome.kind,
      outcome.message,
      outcome.status,
    );
  }

  private consumer(bearerToken: string): GeneratedWiringConsumer {
    return new GeneratedWiringConsumer(
      contract,
      new WiringCommandExecutor({
        baseUrl: this.auth.resolveConvexUrl(),
        bearerToken,
      }),
    );
  }

  private call(
    consumer: GeneratedWiringConsumer,
    capabilityId: string,
    args: Record<string, unknown>,
  ): WiringCommandCall {
    const command = consumer.command(capabilityId);
    const forbidden = new Set(contract.meta.transport.forbiddenBodyKeys);
    const client: Record<string, unknown> = {};
    for (const name of command.clientParameterNames) {
      if (forbidden.has(name)) continue;
      if (!Object.hasOwn(args, name)) continue;
      client[name] = args[name];
    }
    return {
      client,
      docId: this.stringArg(args, "docId"),
      version: this.numberArg(args, "version"),
      idempotencyKey: this.stringArg(args, "idempotencyKey"),
    };
  }

  private stringArg(
    args: Record<string, unknown>,
    name: string,
  ): string | undefined {
    const value = args[name];
    return typeof value === "string" ? value : undefined;
  }

  private numberArg(
    args: Record<string, unknown>,
    name: string,
  ): number | undefined {
    const value = args[name];
    return typeof value === "number" ? value : undefined;
  }
}
