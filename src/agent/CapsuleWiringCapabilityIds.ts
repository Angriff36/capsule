import wiringContract from "../generated/manifest-wiring-contract.json";

interface WiringContractFile {
  capabilities: Array<{ capabilityId: string }>;
}

/** Every capabilityId from generated Manifest wiring (full agent surface). */
export function listWiringCapabilityIds(
  contract: WiringContractFile = wiringContract as WiringContractFile,
): readonly string[] {
  return contract.capabilities.map((c) => c.capabilityId);
}
