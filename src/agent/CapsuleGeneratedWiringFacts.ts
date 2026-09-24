import {
  GeneratedWiringConsumer,
  WiringCommandExecutor,
  type WiringCommandDescriptor,
  type WiringContract,
  type WiringReadDescriptor,
} from "@angriff36/manifest/projections/wiring";
import wiringContract from "../generated/manifest-wiring-contract.json";

const contract = wiringContract as unknown as WiringContract;

/**
 * Reads the generated wiring contract the way a screen would.
 * Discovery does not send a command.
 */
export class CapsuleGeneratedWiringFacts {
  private readonly consumer: GeneratedWiringConsumer;

  constructor() {
    this.consumer = new GeneratedWiringConsumer(
      contract,
      new WiringCommandExecutor({
        baseUrl: "http://127.0.0.1:3210",
        bearerToken: "",
      }),
    );
  }

  offeredCapabilityIds(): ReadonlySet<string> {
    return new Set(
      this.consumer.offeredActions().map((action) => action.capabilityId),
    );
  }

  command(capabilityId: string): WiringCommandDescriptor {
    return this.consumer.command(capabilityId);
  }

  staleReadIds(capabilityId: string): string[] {
    return this.consumer.staleReadIds(capabilityId);
  }

  read(readId: string): WiringReadDescriptor {
    return this.consumer.read(readId);
  }
}
