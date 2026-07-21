import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CAPSULE_ALLOWED_QUERY_NAMES,
  type CapsuleAllowedQueryName,
} from "../CapsuleAllowedQueries";
import { CapsuleQueryClient } from "../CapsuleQueryClient";
import { CapsuleMcpTextResult } from "./CapsuleMcpTextResult";

/**
 * Registers allowlisted read tools so MCP smokes can verify cascade outcomes
 * without opening a Convex side door outside the MCP host.
 */
export class CapsuleMcpQueryRegistrar {
  private readonly text = new CapsuleMcpTextResult();

  constructor(
    private readonly queries: CapsuleQueryClient = new CapsuleQueryClient(),
  ) {}

  register(server: McpServer): void {
    const queryNameSchema = z.enum(
      CAPSULE_ALLOWED_QUERY_NAMES as [
        CapsuleAllowedQueryName,
        ...CapsuleAllowedQueryName[],
      ],
    );

    server.tool(
      "capsule_query",
      "Read allowlisted Capsule Convex queries (demand, prep, purchase needs, vendor orders/lines, weekly purchasing config, pack lists, production batches, deliveries, event closeouts, event assignments). Not a general DB dump.",
      {
        queryName: queryNameSchema,
        args: z
          .record(z.unknown())
          .optional()
          .describe("Query args, e.g. { eventId } or { ingredientId }"),
      },
      async ({ queryName, args }) => {
        const rows = await this.queries.query(queryName, args ?? {});
        return this.text.format({
          ok: true,
          queryName,
          args: args ?? {},
          rowCount: Array.isArray(rows) ? rows.length : null,
          rows,
        });
      },
    );
  }
}
