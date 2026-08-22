import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CapsuleCommandCatalog } from "../CapsuleCommandCatalog";
import type { CapsuleCommandExecutor } from "../CapsuleCommandExecutor";
import { ConvexCommandClient } from "../ConvexCommandClient";
import { CapsuleMcpEventBundleRegistrar } from "./CapsuleMcpEventBundleRegistrar";
import { CapsuleMcpLlmToolRegistrar } from "./CapsuleMcpLlmToolRegistrar";
import { CapsuleMcpQueryRegistrar } from "./CapsuleMcpQueryRegistrar";
import { CapsuleMcpToolRegistrar } from "./CapsuleMcpToolRegistrar";

/**
 * Builds the Capsule product MCP server (stdio host attaches transport).
 */
export class CapsuleMcpServerFactory {
  create(
    executor: CapsuleCommandExecutor = new ConvexCommandClient(),
    catalog: CapsuleCommandCatalog = new CapsuleCommandCatalog(),
  ): McpServer {
    const server = new McpServer({
      name: "capsule-commands",
      version: "0.1.0",
    });
    new CapsuleMcpToolRegistrar(catalog, executor).register(server);
    new CapsuleMcpQueryRegistrar().register(server);
    new CapsuleMcpEventBundleRegistrar(executor).register(server);
    new CapsuleMcpLlmToolRegistrar(catalog, executor).register(server);
    return server;
  }
}
