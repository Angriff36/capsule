import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  CAPSULE_ALLOWED_QUERY_NAMES,
  type CapsuleAllowedQueryName,
} from "../CapsuleAllowedQueries";
import { CapsuleGeneratedReadCatalog } from "../CapsuleGeneratedReadCatalog";
import {
  CapsuleQueryClient,
  type CapsuleReadAudience,
} from "../CapsuleQueryClient";
import { CapsuleMcpTextResult } from "./CapsuleMcpTextResult";

/**
 * Registers allowlisted read tools so MCP smokes can verify cascade outcomes
 * without opening a Convex side door outside the MCP host.
 */
export class CapsuleMcpQueryRegistrar {
  private readonly text = new CapsuleMcpTextResult();

  constructor(
    private readonly queries: CapsuleQueryClient = new CapsuleQueryClient(),
    private readonly reads: CapsuleGeneratedReadCatalog = new CapsuleGeneratedReadCatalog(),
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
      `Read allowlisted Capsule Convex queries (demand, prep, purchase needs, vendor orders, weekly purchasing config, pack lists, production batches, deliveries, event closeouts, event assignments). Required arguments come from generated wiring: ${this.argumentSummary()}. Not a general DB dump.`,
      {
        queryName: queryNameSchema,
        args: z
          .record(z.unknown())
          .optional()
          .describe(
            "Arguments declared by the generated read. No page cursor.",
          ),
        audience: z
          .enum(["agent", "client"])
          .optional()
          .describe(
            "client is refused when the generated read is not client-callable. Default agent.",
          ),
      },
      async ({ queryName, args, audience }) => {
        const caller: CapsuleReadAudience = audience ?? "agent";
        const rows = await this.queries.query(queryName, args ?? {}, caller);
        const read = this.reads.byExportName(queryName);
        return this.text.format({
          ok: true,
          queryName,
          readId: read.readId,
          kind: read.kind,
          clientCallable: read.clientCallable,
          args: args ?? {},
          rowCount: Array.isArray(rows) ? rows.length : null,
          rows,
        });
      },
    );
  }

  private argumentSummary(): string {
    return CAPSULE_ALLOWED_QUERY_NAMES.map((name) => {
      const read = this.reads.byExportName(name);
      const required = read.parameters
        .filter((parameter) => parameter.required)
        .map((parameter) => parameter.name);
      const names = required.length > 0 ? required.join(", ") : "none";
      return `${name} (${read.kind}: ${names})`;
    }).join("; ");
  }
}
