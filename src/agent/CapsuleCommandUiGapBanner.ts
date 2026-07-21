import { CapsuleCommandUiCoverage } from "./CapsuleCommandUiCoverage";

const RED = "\u001b[31;1m";
const RESET = "\u001b[0m";

/**
 * Loud human + agent warning when a command has no Capsule UI screen.
 */
export class CapsuleCommandUiGapBanner {
  constructor(
    private readonly coverage: CapsuleCommandUiCoverage = new CapsuleCommandUiCoverage(),
  ) {}

  forCapability(capabilityId: string): string | null {
    if (this.coverage.hasUi(capabilityId)) {
      return null;
    }
    return this.render([capabilityId]);
  }

  forCapabilities(capabilityIds: readonly string[]): string | null {
    const gaps = capabilityIds.filter((id) => !this.coverage.hasUi(id));
    if (gaps.length === 0) {
      return null;
    }
    return this.render(gaps);
  }

  /** Short prefix for tool descriptions (listTools / LLM defs). */
  descriptionPrefix(capabilityId: string): string {
    if (this.coverage.hasUi(capabilityId)) {
      return "";
    }
    return "⚠️ NO UI — backend-only; kitchen users cannot click this yet. ";
  }

  private render(capabilityIds: readonly string[]): string {
    const lines = [
      `${RED}════════════════════════════════════════════════════════════${RESET}`,
      `${RED}  ⚠️  NO UI IMPLEMENTATION — DO NOT TREAT AS USER-READY${RESET}`,
      `${RED}════════════════════════════════════════════════════════════${RESET}`,
      "",
      "This command exists in the domain/backend and the agent MAY execute it,",
      "but Capsule has NO authored screen/button for it yet.",
      "A cook/user CANNOT do this in the app UI today.",
      "",
      "Capabilities:",
      ...capabilityIds.map((id) => `  • ${id}`),
      "",
      "Tell the human this out loud. Do not imply product completeness.",
      `${RED}════════════════════════════════════════════════════════════${RESET}`,
    ];
    return lines.join("\n");
  }
}
