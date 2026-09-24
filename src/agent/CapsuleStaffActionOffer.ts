import type { WiringActionPresentation } from "@angriff36/manifest/projections/wiring";
import { CapsuleCommandCatalog } from "./CapsuleCommandCatalog";

/**
 * What a staff screen may show for one command.
 * Internal commands return nothing here and stay available to system code.
 */
export class CapsuleStaffActionOffer {
  constructor(private readonly catalog = new CapsuleCommandCatalog()) {}

  forPerson(capabilityId: string): WiringActionPresentation | null {
    const offered = this.catalog
      .offeredToPeople()
      .find((descriptor) => descriptor.capabilityId === capabilityId);
    if (!offered || offered.presentation.exposure !== "human") return null;
    return offered.presentation;
  }

  stillCallableBySystem(capabilityId: string): boolean {
    return this.catalog.has(capabilityId);
  }
}

/** True only when the generated action says the person must confirm first. */
export function staffActionNeedsConfirm(
  presentation: { confirm: boolean } | null,
): boolean {
  return presentation?.confirm === true;
}
