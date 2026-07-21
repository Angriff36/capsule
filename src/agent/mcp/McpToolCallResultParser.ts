type ToolContent = { type: string; text?: string };

/**
 * Strict MCP tool result parser for Capsule smokes.
 * Rejects banner-only / error-shaped / unflagged payloads.
 */
export class McpToolCallResultParser {
  textFrom(result: { content?: unknown; isError?: boolean }): string {
    const parts = (result.content ?? []) as ToolContent[];
    return parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text!)
      .join("\n");
  }

  /**
   * Parse the last JSON object text block (UI-gap banners may precede it).
   * Requires explicit ok:true or success:true unless requireSuccess is false.
   */
  parseObject(
    result: { content?: unknown; isError?: boolean },
    options: { requireSuccess?: boolean } = {},
  ): Record<string, unknown> {
    if (result.isError) {
      throw new Error(`MCP tool error: ${this.textFrom(result)}`);
    }
    const parts = (result.content ?? []) as ToolContent[];
    const jsonBlocks = parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text!.trim())
      .filter((t) => t.startsWith("{"));
    if (jsonBlocks.length === 0) {
      throw new Error(
        `No JSON object block in MCP result: ${this.textFrom(result).slice(0, 500)}`,
      );
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(jsonBlocks[jsonBlocks.length - 1]!) as Record<
        string,
        unknown
      >;
    } catch (error) {
      throw new Error(
        `Invalid JSON in MCP result: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (payload.error != null || payload.code === "COMMAND_FAILED") {
      throw new Error(
        `MCP payload reports failure: ${JSON.stringify(payload).slice(0, 1200)}`,
      );
    }
    const requireSuccess = options.requireSuccess !== false;
    if (requireSuccess && payload.ok !== true && payload.success !== true) {
      throw new Error(
        `MCP payload missing ok/success true: ${JSON.stringify(payload).slice(0, 1200)}`,
      );
    }
    return payload;
  }
}
