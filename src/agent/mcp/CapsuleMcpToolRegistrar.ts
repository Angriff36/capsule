import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CapsuleCommandCatalog } from "../CapsuleCommandCatalog";
import type { CapsuleCommandExecutor } from "../CapsuleCommandExecutor";
import { CapsuleDocumentEnterCoordinator } from "../CapsuleDocumentEnterCoordinator";
import { CapsuleEventPrepCoordinator } from "../CapsuleEventPrepCoordinator";
import { CapsuleIngredientCatalogLoader } from "../CapsuleIngredientCatalogLoader";
import { CapsuleLiveEventPrepStateLoader } from "../CapsuleLiveEventPrepStateLoader";

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

/**
 * Registers Capsule product command tools (not Manifest authoring MCP).
 */
export class CapsuleMcpToolRegistrar {
  constructor(
    private readonly catalog: CapsuleCommandCatalog,
    private readonly executor: CapsuleCommandExecutor,
  ) {}

  register(server: McpServer): void {
    server.tool(
      "list_capsule_commands",
      "List Capsule governed kitchen/ops commands agents may execute (from Manifest wiring contract).",
      {},
      async () => textResult({ commands: this.catalog.list() }),
    );

    server.tool(
      "describe_capsule_command",
      "Describe one Capsule capability: params, Convex mutation name, emits.",
      {
        capabilityId: z
          .string()
          .describe("e.g. Ingredient.introduce, Recipe.draft"),
      },
      async ({ capabilityId }) => textResult(this.catalog.get(capabilityId)),
    );

    server.tool(
      "execute_capsule_command",
      "Execute a governed Capsule command via the same Convex mutation the UI uses. Pass idempotencyKey for safe retries.",
      {
        capabilityId: z.string(),
        args: z
          .record(z.unknown())
          .describe("Client parameters for the command"),
        idempotencyKey: z.string().optional(),
      },
      async ({ capabilityId, args, idempotencyKey }) => {
        const result = await this.executor.execute({
          capabilityId,
          args,
          idempotencyKey,
        });
        return textResult({ ok: true, capabilityId, result });
      },
    );

    server.tool(
      "add_event_dish_and_sync_prep",
      "Add a Dish to an Event, then reconcile its generated PrepTasks and IngredientDemand through the same governed commands as the Event menu. Does not create or submit a purchase order.",
      {
        eventId: z.string(),
        dishId: z.string(),
        quantityServings: z.number().nonnegative(),
        course: z.string().optional(),
        serviceStyle: z.string().optional(),
        specialInstructions: z.string().optional(),
        idempotencyKey: z.string().optional(),
      },
      async (input) => {
        const coordinator = new CapsuleEventPrepCoordinator(
          this.executor,
          new CapsuleLiveEventPrepStateLoader(),
        );
        return textResult({
          ok: true,
          result: await coordinator.addDishAndSync(input),
        });
      },
    );

    server.tool(
      "preview_recipe_document",
      "Parse a recipe document without writing. Inspect lines/yield/instructions before enter_recipe_document.",
      {
        sourceText: z.string().describe("Full recipe document text"),
      },
      async ({ sourceText }) => {
        const catalog = await new CapsuleIngredientCatalogLoader().load();
        const coordinator = new CapsuleDocumentEnterCoordinator(this.executor);
        const preview = coordinator.previewFromText({ sourceText, catalog });
        return textResult({
          ok: true,
          mode: "preview",
          catalogSize: catalog.length,
          name: preview.review.name,
          yieldQuantity: preview.review.yieldQuantity,
          yieldUnit: preview.review.yieldUnit,
          instructions: preview.review.instructions,
          unresolvedLineCount: preview.unresolvedLineCount,
          safeToEnterWithoutApproval: preview.safeToEnterWithoutApproval,
          warnings: preview.warnings,
          lines: preview.review.lines.map((line) => ({
            raw: line.raw,
            name: line.name,
            quantity: line.quantity,
            unit: line.unit,
            matchStatus: line.matchStatus,
            createNew: line.createNew,
            matchedIngredientName: line.matchedIngredientName,
            possibleMatchNames: line.possibleMatchNames,
            prepNotes: line.prepNotes,
          })),
        });
      },
    );

    server.tool(
      "enter_recipe_document",
      "Enter a previewed recipe through governed createVia commands. Loads live catalog. Refuses unresolved lines unless approveUnresolvedAsNew is true (creates active ingredients — no pending state).",
      {
        sourceText: z.string().describe("Full recipe document text"),
        approveUnresolvedAsNew: z
          .boolean()
          .optional()
          .describe(
            "Required true to create new active ingredients for unmatched lines. Default false (safe).",
          ),
        introduceDish: z
          .boolean()
          .optional()
          .describe("Default true — also Dish.introduce for the recipe"),
        dishPortionSize: z.number().optional(),
        dishPortionUnit: z.string().optional(),
      },
      async (args) => {
        const catalog = await new CapsuleIngredientCatalogLoader().load();
        const coordinator = new CapsuleDocumentEnterCoordinator(this.executor);
        const result = await coordinator.enterFromText({
          sourceText: args.sourceText,
          catalog,
          introduceDish: args.introduceDish,
          dishPortionSize: args.dishPortionSize,
          dishPortionUnit: args.dishPortionUnit,
          approveUnresolvedAsNew: args.approveUnresolvedAsNew === true,
        });
        return textResult({ ok: true, catalogSize: catalog.length, result });
      },
    );
  }
}
