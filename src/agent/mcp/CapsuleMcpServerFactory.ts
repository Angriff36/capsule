import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CapsuleAgentAuthManager } from "../CapsuleAgentAuthManager";
import { CapsuleCommandCatalogProvider } from "../CapsuleCommandCatalogProvider";
import type { CapsuleCommandExecutor } from "../CapsuleCommandExecutor";
import { ConvexCommandClient } from "../ConvexCommandClient";
import { CapsuleMcpLlmToolRegistrar } from "./CapsuleMcpLlmToolRegistrar";
import { CapsuleMcpQueryRegistrar } from "./CapsuleMcpQueryRegistrar";
import { CapsuleMcpToolRegistrar } from "./CapsuleMcpToolRegistrar";

/**
 * Builds the Capsule product MCP server (stdio host attaches transport).
 */
export class CapsuleMcpServerFactory {
  create(
    catalogProvider: CapsuleCommandCatalogProvider = new CapsuleCommandCatalogProvider(),
    executor: CapsuleCommandExecutor = new ConvexCommandClient(
      new CapsuleAgentAuthManager(),
      catalogProvider,
    ),
  ): McpServer {
    const server = new McpServer({
      name: "capsule-commands",
      version: "0.1.0",
    });
    new CapsuleMcpToolRegistrar(catalogProvider, executor).register(server);
    new CapsuleMcpQueryRegistrar().register(server);
    new CapsuleMcpLlmToolRegistrar(catalogProvider, executor).register(server);
    return server;
  }
}
