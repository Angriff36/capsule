/**
 * Capsule product MCP — governed commands for IDE agents.
 *
 * Env: CONVEX_URL (or VITE_CONVEX_URL), CAPSULE_AGENT_JWT
 *
 * Cursor MCP example:
 *   { "command": "bun", "args": ["run", "scripts/capsule-mcp.ts"], "cwd": "<capsule>" }
 *
 * Bootstrap chdirs to the Capsule repo and loads `.env.local` even when Cursor
 * omits cwd (live discovery / mcp_auth timeout — #85).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CapsuleMcpHostBootstrap } from "../src/agent/mcp/CapsuleMcpHostBootstrap";
import { CapsuleMcpServerFactory } from "../src/agent/mcp/CapsuleMcpServerFactory";

async function main(): Promise<void> {
  new CapsuleMcpHostBootstrap().prepare(import.meta.url);
  const server = new CapsuleMcpServerFactory().create();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[capsule-mcp] ${message}`);
  process.exit(1);
});
