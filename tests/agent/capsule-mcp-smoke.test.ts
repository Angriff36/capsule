import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { CapsuleCommandCatalog } from "../../src/agent/CapsuleCommandCatalog";
import { CapsuleMcpServerFactory } from "../../src/agent/mcp/CapsuleMcpServerFactory";
import { McpToolCallResultParser } from "../../src/agent/mcp/McpToolCallResultParser";

type ToolResult = { content?: unknown; isError?: boolean };

async function connect(executor: { execute: ReturnType<typeof vi.fn> }) {
  const catalog = new CapsuleCommandCatalog();
  const server = new CapsuleMcpServerFactory().create(executor, catalog);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "capsule-smoke", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, catalog };
}

describe("Capsule MCP smoke", () => {
  const parser = new McpToolCallResultParser();

  it("executes a governed command over MCP and parses the JSON block past the UI-gap banner", async () => {
    const execute = vi.fn().mockResolvedValue({ docId: "doc-1" });
    const { client, catalog } = await connect({ execute });
    const capabilityId = catalog.uiGaps()[0] ?? catalog.list()[0]!.capabilityId;

    const result = (await client.callTool({
      name: "execute_capsule_command",
      arguments: { capabilityId, args: { name: "smoke" } },
    })) as ToolResult;

    const payload = parser.parseObject(result);
    expect(payload.ok).toBe(true);
    expect(payload.capabilityId).toBe(capabilityId);
    expect(payload.result).toEqual({ docId: "doc-1" });
    expect(execute).toHaveBeenCalledWith({
      capabilityId,
      args: { name: "smoke" },
      idempotencyKey: undefined,
    });
  });

  it("surfaces an unknown capability as an MCP error the parser rejects", async () => {
    const { client } = await connect({ execute: vi.fn() });

    const result = (await client.callTool({
      name: "describe_capsule_command",
      arguments: { capabilityId: "Nope.nothing" },
    })) as ToolResult;

    expect(result.isError).toBe(true);
    expect(() => parser.parseObject(result)).toThrow(/MCP tool error/);
  });
});
