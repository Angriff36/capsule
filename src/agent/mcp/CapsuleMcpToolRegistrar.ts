import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CapsuleCommandCatalog } from "../CapsuleCommandCatalog";
import type { CapsuleCommandExecutor } from "../CapsuleCommandExecutor";
import { CapsuleDocumentEnterCoordinator } from "../CapsuleDocumentEnterCoordinator";
import { CapsuleEventPrepCoordinator } from "../CapsuleEventPrepCoordinator";
import { CapsuleIngredientCatalogLoader } from "../CapsuleIngredientCatalogLoader";
import { CapsuleLiveEventPrepStateLoader } from "../CapsuleLiveEventPrepStateLoader";
import { CapsuleMcpTextResult } from "./CapsuleMcpTextResult";

/**
 * Registers Capsule product command tools (not Manifest authoring MCP).
 */
export class CapsuleMcpToolRegistrar {
  private readonly text = new CapsuleMcpTextResult();

  constructor(
    private readonly catalog: CapsuleCommandCatalog,
    private readonly executor: CapsuleCommandExecutor,
  ) {}

  register(server: McpServer): void {
    server.tool(
      "list_capsule_commands",
      "List Capsule governed kitchen/ops commands. Each entry has uiImplemented; gaps mean backend-only (no Capsule screen yet).",
      {},
      async () => {
        const commands = this.catalog.list();
        const uiGaps = this.catalog.uiGaps();
        return this.text.format(
          {
            commands,
            uiGaps,
            uiGapWarning:
              uiGaps.length > 0
                ? "Some listed commands have NO Capsule UI — see uiGaps and red banner above."
                : null,
          },
          { warnCapabilityIds: uiGaps },
        );
      },
    );

    server.tool(
      "describe_capsule_command",
      "Describe one Capsule capability: params, Convex mutation, emits, uiImplemented.",
      {
        capabilityId: z
          .string()
          .describe("e.g. Ingredient.introduce, Recipe.draft"),
      },
      async ({ capabilityId }) => {
        const descriptor = this.catalog.get(capabilityId);
        return this.text.format(descriptor, {
          warnCapabilityIds: [capabilityId],
        });
      },
    );

    server.tool(
      "execute_capsule_command",
      "Execute a governed Capsule command via Convex. Allowed even without UI — if uiImplemented is false, warn the human loudly.",
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
        return this.text.format(
          {
            ok: true,
            capabilityId,
            uiImplemented: this.catalog.get(capabilityId).uiImplemented,
            result,
          },
          { warnCapabilityIds: [capabilityId] },
        );
      },
    );

    server.tool(
      "add_event_dish_and_sync_prep",
      "Add a Dish to an Event, then materialize PrepTasks from active DishTask templates (host sync). IngredientDemand is Manifest-owned on EventDish.addToEvent (this tool sets skipDemand). Does not create or submit a purchase order.",
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
        return this.text.format({
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
        return this.text.format({
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
          .describe(
            "Default false. Recipe sheets are Recipes (work/recipes). Dishes are production-sheet menu items with DishTask lines (work/list*.jpg). Opt-in only — do not invent a Dish from a recipe title.",
          ),
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
        return this.text.format({
          ok: true,
          catalogSize: catalog.length,
          result,
        });
      },
    );
  }
}
