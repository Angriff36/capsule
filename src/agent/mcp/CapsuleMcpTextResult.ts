import { CapsuleCommandUiGapBanner } from "../CapsuleCommandUiGapBanner";

export interface CapsuleMcpTextResultOptions {
  /** When set, prepend a red NO-UI banner if any id lacks UI. */
  warnCapabilityIds?: readonly string[];
}

/**
 * Builds MCP tool content: optional red UI-gap banner + JSON body.
 */
export class CapsuleMcpTextResult {
  constructor(
    private readonly banner: CapsuleCommandUiGapBanner = new CapsuleCommandUiGapBanner(),
  ) {}

  format(value: unknown, options: CapsuleMcpTextResultOptions = {}) {
    const content: Array<{ type: "text"; text: string }> = [];
    const warnIds = options.warnCapabilityIds;
    if (warnIds && warnIds.length > 0) {
      const warning = this.banner.forCapabilities(warnIds);
      if (warning) {
        content.push({ type: "text", text: warning });
      }
    }
    content.push({ type: "text", text: JSON.stringify(value, null, 2) });
    return { content };
  }
}
