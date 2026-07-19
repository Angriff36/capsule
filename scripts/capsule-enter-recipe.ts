/**
 * Preview or enter a plain-text recipe via governed commands.
 *
 *   bun run agent:enter-recipe -- --preview path/to/recipe.txt
 *   bun run agent:enter-recipe -- path/to/recipe.txt --approve-new
 *
 * Loads the live Ingredient catalog for matching. Default write path refuses
 * unresolved lines (no silent creates).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CapsuleDocumentEnterCoordinator } from "../src/agent/CapsuleDocumentEnterCoordinator";
import { CapsuleIngredientCatalogLoader } from "../src/agent/CapsuleIngredientCatalogLoader";
import { ConvexCommandClient } from "../src/agent/ConvexCommandClient";

function usage(): never {
  console.error(`Usage:
  bun run agent:enter-recipe -- --preview <path-to-recipe.txt>
  bun run agent:enter-recipe -- <path-to-recipe.txt> --approve-new [--no-dish]

Preview never writes. Loads live Ingredient catalog for exact/possible matches.
Enter without --approve-new only succeeds when every line exactly matches.`);
  process.exit(2);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    usage();
  }
  const preview = args.includes("--preview");
  const approveNew = args.includes("--approve-new");
  const noDish = args.includes("--no-dish");
  const pathArg = args.find((a) => !a.startsWith("--"));
  if (!pathArg) usage();

  const filePath = resolve(process.cwd(), pathArg);
  const sourceText = readFileSync(filePath, "utf8");
  if (!sourceText.trim()) {
    throw new Error(`Recipe file is empty: ${filePath}`);
  }

  const catalog = await new CapsuleIngredientCatalogLoader().load();
  const coordinator = new CapsuleDocumentEnterCoordinator(
    new ConvexCommandClient(),
  );

  if (preview) {
    const result = coordinator.previewFromText({ sourceText, catalog });
    const exact = result.review.lines.filter((l) => l.matchStatus === "exact");
    const possible = result.review.lines.filter(
      (l) => l.matchStatus === "possible",
    );
    const unresolved = result.review.lines.filter(
      (l) =>
        l.matchStatus !== "exact" &&
        l.matchStatus !== "confirmed_existing" &&
        l.matchStatus !== "confirmed_new",
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "preview",
          source: filePath,
          catalogSize: catalog.length,
          name: result.review.name,
          yieldQuantity: result.review.yieldQuantity,
          yieldUnit: result.review.yieldUnit,
          instructions: result.review.instructions,
          unresolvedLineCount: result.unresolvedLineCount,
          exactMatchCount: exact.length,
          possibleMatchCount: possible.length,
          wouldCreateIfApproved: unresolved.filter(
            (l) =>
              l.createNew ||
              l.matchStatus === "new" ||
              l.matchStatus === "possible",
          ).length,
          safeToEnterWithoutApproval: result.safeToEnterWithoutApproval,
          warnings: result.warnings,
          lines: result.review.lines.map((line) => ({
            raw: line.raw,
            name: line.name,
            quantity: line.quantity,
            unit: line.unit,
            matchStatus: line.matchStatus,
            createNew: line.createNew,
            matchedIngredientId: line.matchedIngredientId,
            matchedIngredientName: line.matchedIngredientName,
            possibleMatchNames: line.possibleMatchNames,
            prepNotes: line.prepNotes,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  const result = await coordinator.enterFromText({
    sourceText,
    catalog,
    introduceDish: !noDish,
    approveUnresolvedAsNew: approveNew,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "enter",
        source: filePath,
        catalogSize: catalog.length,
        ...result,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[capsule-enter-recipe] ${message}`);
  process.exit(1);
});
