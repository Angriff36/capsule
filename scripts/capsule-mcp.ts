/**
 * Capsule product MCP — governed commands for IDE agents.
 *
 * Env: CONVEX_URL (or VITE_CONVEX_URL), CAPSULE_AGENT_JWT
 *
 * Cursor MCP example:
 *   { "command": "bun", "args": ["run", "scripts/capsule-mcp.ts"], "cwd": "<capsule>" }
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CapsuleEnvLocalLoader } from "../src/agent/CapsuleEnvLocalLoader";
import { CapsuleMcpServerFactory } from "../src/agent/mcp/CapsuleMcpServerFactory";

async function main(): Promise<void> {
  new CapsuleEnvLocalLoader().load();
  const server = new CapsuleMcpServerFactory().create();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[capsule-mcp] ${message}`);
  process.exit(1);
});
