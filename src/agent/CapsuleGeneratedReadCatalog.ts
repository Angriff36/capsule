import {
  GeneratedWiringConsumer,
  WiringCommandExecutor,
  type WiringContract,
  type WiringReadDescriptor,
} from "@angriff36/manifest/projections/wiring";
import wiringContract from "../generated/manifest-wiring-contract.json";

const generatedContract = wiringContract as unknown as WiringContract;

/**
 * Reads list, detail, and indexed query facts from the generated wiring
 * contract. Argument names and client visibility come from that contract.
 */
export class CapsuleGeneratedReadCatalog {
  private readonly consumer: GeneratedWiringConsumer;
  private readonly contract: WiringContract;

  constructor(contract: WiringContract = generatedContract) {
    this.contract = contract;
    this.consumer = new GeneratedWiringConsumer(
      contract,
      new WiringCommandExecutor({
        baseUrl: "http://unused.invalid",
        bearerToken: "",
      }),
    );
  }

  byReadId(readId: string): WiringReadDescriptor {
    return this.consumer.read(readId);
  }

  byExportName(exportName: string): WiringReadDescriptor {
    const listed = this.contract.reads.find(
      (read) => read.exportName === exportName,
    );
    if (!listed) {
      throw new Error(`Generated wiring has no read export '${exportName}'.`);
    }
    return this.consumer.read(listed.readId);
  }

  /** Copies only the arguments the generated read declares. */
  argumentsFor(
    exportName: string,
    supplied: Record<string, unknown>,
  ): Record<string, unknown> {
    const read = this.byExportName(exportName);
    this.assertNoPagination(read, supplied);
    const args: Record<string, unknown> = {};
    for (const parameter of read.parameters) {
      const value = supplied[parameter.name];
      const missing = value == null || value === "";
      if (missing && parameter.required) {
        throw new Error(
          `Read '${read.readId}' requires argument '${parameter.name}'.`,
        );
      }
      if (!missing && Object.hasOwn(supplied, parameter.name)) {
        args[parameter.name] = value;
      }
    }
    return args;
  }

  assertClientMayCall(exportName: string): WiringReadDescriptor {
    const read = this.byExportName(exportName);
    if (!read.clientCallable) {
      throw new Error(`Read '${read.readId}' is not client-callable.`);
    }
    return read;
  }

  private assertNoPagination(
    read: WiringReadDescriptor,
    supplied: Record<string, unknown>,
  ): void {
    if (read.pagination !== "unsupported") {
      throw new Error(
        `Read '${read.readId}' declares pagination this caller does not invent.`,
      );
    }
    if ("cursor" in supplied || "paginationOpts" in supplied) {
      throw new Error(`Read '${read.readId}' does not take a page cursor.`);
    }
  }
}
