import { CapsuleCommandCatalog } from "./CapsuleCommandCatalog";
import { CapsuleWiringContractLoader } from "./CapsuleWiringContractLoader";
import { listWiringCapabilityIds } from "./CapsuleWiringCapabilityIds";

/**
 * Fresh CapsuleCommandCatalog when the on-disk wiring contract changes.
 * Used by the long-lived MCP host so tools/list discovery + execute stay current
 * after manifest:regen without restarting Cursor (#16).
 */
export class CapsuleCommandCatalogProvider {
  private catalog: CapsuleCommandCatalog | null = null;
  private mtimeMs = Number.NaN;

  constructor(
    private readonly loader: CapsuleWiringContractLoader = new CapsuleWiringContractLoader(),
  ) {}

  get(): CapsuleCommandCatalog {
    const snapshot = this.loader.load();
    if (this.catalog == null || snapshot.mtimeMs !== this.mtimeMs) {
      this.catalog = new CapsuleCommandCatalog(
        snapshot.contract,
        listWiringCapabilityIds(snapshot.contract),
      );
      this.mtimeMs = snapshot.mtimeMs;
    }
    return this.catalog;
  }
}
