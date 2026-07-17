# Culinary Recipe Import and Entity Navigation Design

**Date:** 2026-07-17
**Status:** Approved for implementation

## Goal

Add a governed recipe-import workflow for pasted text, `.txt` files, and the existing recipe CSV exports; make the culinary workspace denser and easier to navigate; and add missing detail routes and links for Ingredient, Dish, and Menu without hand-editing generated output.

## Evidence and Product Direction

The design follows:

- `.tmp/DESIGN.md`, especially the culinary catalog, detail, and two-pane workbench patterns;
- the stored Galley recipe-detail and import references in `docs/design-references/galley`;
- the real catering recipe and prep materials in `C:/Users/Ryan/Downloads/work`, including mixed-fraction text recipes, pound notation, CSV recipe sheets, CSV ingredient lines, and photographed paper recipes;
- the existing generated culinary hooks and command boundary;
- `docs/generation/command-idempotency.md` for actual retry behavior.

Photo OCR is explicitly excluded from this version.

## Scope

### Included

- Pasted recipe text.
- `.txt` recipe files.
- `recipe_sheet.csv` and `recipe_lines.csv`, including a paired-file import.
- Durable import provenance and review state.
- Deterministic parsing of recipe identity, yield, ingredient lines, and method text.
- Exact, possible, and new Ingredient matching with mandatory confirmation for non-exact matches.
- Final creation of a draft Recipe, confirmed new Ingredients, and RecipeIngredient lines through generated commands.
- A Galley-inspired source/review workspace.
- Compact Recipe detail layout.
- Ingredient, Dish, and Menu detail routes.
- Links between visible culinary entity references.

### Excluded

- OCR or image parsing.
- URL scraping.
- AI-generated parsing or matching.
- Automatic publishing of imported recipes.
- Automatic creation of unmatched Ingredients without review.
- Handwritten replacements for generated hooks, validators, lifecycle tables, or mutations.
- Direct writes to Manifest-owned Convex tables.

## Ownership Boundary

Manifest source owns all durable import entities, properties, enums, relationships, constraints, policies, lifecycle transitions, commands, and emitted events. Builder and Convex codegen produce schemas, validators, mutations, hooks, bindings, and other generated artifacts.

Authored Capsule code owns raw file reading, deterministic parsing, normalized matching, page composition, accessible interaction, progress presentation, and orchestration of generated commands.

Generated files must only change through the repository's Builder and codegen workflow. No generated file may be hand-edited.

## Manifest Model

Create `src/culinary/recipe-import.manifest` and include it from the culinary compile graph.

### Enums

`RecipeImportSourceKind`:

- `pasted_text`
- `text_file`
- `csv_bundle`

`RecipeImportStatus`:

- `uploaded`
- `parsed`
- `reviewing`
- `ready`
- `finalizing`
- `completed`
- `failed`
- `cancelled`

`RecipeImportMatchStatus`:

- `unresolved`
- `exact`
- `possible`
- `new`
- `confirmed_existing`
- `confirmed_new`

### RecipeImport

`RecipeImport` is tenant-scoped, soft-deletable, durable, timestamped, and versioned. It records:

- source kind, source filename, raw source text, source byte count, and a deterministic source fingerprint;
- parsed recipe name, description, category, cuisine, instructions, yield quantity, yield unit, and batch multiplier;
- parsed line count and resolved line count;
- lifecycle status and parsing/finalization failure detail;
- resulting Recipe ID when known;
- uploaded, parsed, review-started, ready, finalization-started, completed, failed, and cancelled timestamps.

It has many `RecipeImportLine` rows and may reference the resulting Recipe.

The model must require non-empty source content, positive yield and batch values when present, non-negative line counts, `resolvedLineCount <= parsedLineCount`, and a resulting Recipe ID before completion.

Commands govern:

- `upload`
- `recordParse`
- `beginReview`
- `recordResolutionProgress`
- `approveReview`
- `beginFinalization`
- `recordRecipe`
- `markFailed`
- `resumeReview`
- `complete`
- `cancel`

Every update command uses the current generated version. Lifecycle transitions reject invalid repeated actions rather than pretending they are idempotent.

### RecipeImportLine

`RecipeImportLine` is tenant-scoped, soft-deletable, durable, timestamped, and versioned. It records:

- parent import ID and source row/order;
- the original source line;
- parsed quantity, unit, Ingredient name, and preparation note;
- match status;
- matched Ingredient ID when confirmed;
- possible-match Ingredient IDs as advisory candidates;
- resolution timestamp.

It belongs to `RecipeImport` and may belong to an existing Ingredient.

Commands govern:

- `stage`
- `suggestExactMatch`
- `suggestPossibleMatches`
- `markNew`
- `confirmExisting`
- `confirmNew`
- `resetResolution`
- `discard`

Only `exact` and `confirmed_existing` lines may carry a matched Ingredient ID. A `confirmed_new` line remains explicitly marked until its generated Ingredient creation succeeds and the resulting Ingredient is attached.

### Permanent Recipe Provenance

Import-specific source and review state stays on `RecipeImport`. Existing Recipe fields change only if the final Recipe requires a permanent, operator-visible value that does not already exist. The resulting Recipe is linked from the import record rather than duplicating raw import metadata onto every Recipe.

## Parser Design

The parser is a pure authored TypeScript module under `src/features/kitchen/recipe-import/`. It has no database access and no generated-file imports beyond consuming generated command input shapes at the integration boundary.

### Text Parsing

The parser must handle the observed kitchen notation:

- whole, decimal, simple-fraction, and mixed-fraction quantities;
- `#`, `LB`, `LBS`, cups, tablespoons, teaspoons, quarts, ounces, each, and common abbreviations;
- yields such as `YIELDS 3#`, `Yields 3 quarts`, and `59# RAW WEIGHT`;
- headings such as `INGREDIENTS` and `METHOD`;
- numbered and nested lettered procedures;
- ingredient lines without an explicit quantity;
- preparation notes following commas or parenthetical text.

Ambiguous content is preserved in the original line and left review-required. The parser never invents a quantity, unit, Ingredient, yield, or method.

### CSV Parsing

The CSV parser supports quoted values, embedded commas, blank optional cells, CRLF/LF input, and paired recipe-sheet/recipe-line files. It recognizes files by their headers rather than filenames alone. Rows that cannot be associated with a recipe remain visible as import errors instead of being dropped.

No new package is required; the parser remains local and deterministic.

### Ingredient Matching

Matching normalizes case, surrounding whitespace, repeated whitespace, punctuation, and conservative singular/plural variants.

- One unambiguous normalized match becomes `exact` and is linked automatically.
- Similar catalog names become `possible` candidates but are never linked automatically.
- No suitable candidate becomes `new`.
- Operators may replace an exact match, confirm a possible match, or confirm creation of a new Ingredient.

## Import Workspace

Add `/kitchen/recipes/import`.

Desktop uses two panes only during source comparison:

- The left pane contains Paste and Files modes, source preview, filename information, and Parse/Replace controls.
- The right pane contains editable parsed Recipe fields, yield, method, and Ingredient lines.
- The review pane has the stronger border and action hierarchy.

Each Ingredient line displays a text label and icon for Exact match, Possible match, New ingredient, or Needs review. Color is supplementary. Possible and new matches provide a searchable existing-Ingredient selector; new Ingredients require explicit confirmation.

Finalization remains unavailable until every active line is resolved and required Recipe fields are valid. Completion links directly to the created Recipe.

On mobile, a Source/Review mode switch replaces the two-column presentation.

## Culinary Detail and Navigation

### Recipe Detail

Replace the oversized masthead with a compact working-document header:

- collection link and edition/status context;
- a restrained serif title;
- condensed yield, batch, category, and cuisine facts;
- edit and lifecycle actions kept beside the identity they affect.

Ingredients and method move much closer to the top of the viewport. On suitable desktop widths, composition and method use a balanced working grid. Add/edit forms remain collapsed until requested. Long recipes may still scroll naturally, but decorative whitespace must not consume the working viewport.

### New Detail Routes

Add:

- `/kitchen/ingredients/:id`
- `/kitchen/dishes/:id`
- `/kitchen/menus/:id`

Each page uses its existing generated detail hook and generated list hooks only where a real relationship must be shown.

- Ingredient detail shows identity, costing/allergen/status facts, and linked Recipes using it.
- Dish detail shows identity, portion/service facts, linked Recipe, and linked Event uses when available.
- Menu detail shows identity, pricing/guest/status facts and only relationships present in the generated graph.

### Hyperlinks

Within the kitchen feature, every displayed reference to Recipe, Ingredient, Dish, or Menu becomes a link when that entity has a detail route. This includes catalog names, Recipe ingredients, Recipe dish uses, Ingredient recipe uses, Dish recipes, and Event dish selections.

## Loading, Empty, Success, and Error States

- Skeletons match the final header, facts, and workbench geometry.
- Empty source state explains accepted inputs and offers Paste recipe or Choose files.
- Parsing state announces progress without blocking source cancellation.
- Parse errors preserve source content and identify the affected file or row.
- Review state reports unresolved count and moves focus to the first unresolved line when requested.
- Finalization reports the current confirmed step.
- Completion links to the created Recipe and offers another import.
- Missing entities use a clear not-found state with a route back to the relevant catalog.
- Generated command failures use the existing culinary failure classification.

## Accessibility

- Every control has an associated visible label.
- Match state is conveyed by text, not color alone.
- Source/Review tabs use proper tab semantics on mobile.
- Parsing, saving, completion, and failures are announced through an appropriate live region.
- Error summaries link to the affected field or line.
- Keyboard focus is visible and intentionally moved only after parse, validation failure, or successful completion.
- Buttons expose busy state and remain protected from duplicate clicks while a command is pending.
- Reduced-motion preferences are respected.

## Command Idempotency and Recovery

Capsule's generated Convex commands do not expose Manifest's reference-runtime `IdempotencyStore`. Creates, emitting commands, and reactions are not assumed idempotent.

- The UI prevents concurrent duplicate submission but does not claim command-layer deduplication.
- Progress is recorded only after a command returns a confirmed success.
- Resume starts from confirmed checkpoints.
- A timeout or unknown outcome never triggers an automatic repeated create.
- After an unknown Recipe create, the operator refreshes and links the possibly created Recipe or explicitly authorizes a new attempt.
- After an unknown Ingredient create, the catalog is refreshed and the line is reconciled before another create is offered.
- Version conflicts refresh the import before the operator's resolution is reapplied.
- Completion is reported only after the resulting Recipe ID and all expected confirmed RecipeIngredient rows are observable.

## Verification

### Parser Unit Tests

Use sanitized fixtures representing Basil Pesto, Macaroni Salad, Signature Vegetable Medley, recipe-sheet CSV, and recipe-line CSV. Cover mixed fractions, catering pound notation, abbreviations, blank quantities, nested methods, quoted CSV cells, malformed rows, and source preservation.

### Manifest and Runtime Tests

- Compile and validate the full Manifest graph.
- Prove allowed and rejected RecipeImport lifecycle transitions.
- Prove per-line resolution constraints and tenant isolation.
- Prove stale-version conflict behavior.
- Prove generated creation is used for Recipe, Ingredient, and RecipeIngredient.
- Prove duplicate clicks are suppressed at the UI boundary and unknown outcomes are reconciled rather than blindly retried.

### Authored UI Tests

- Extend the culinary route/hook contract for import and new detail routes.
- Test parser and matching behavior directly.
- Test navigation helpers for every new entity path.
- Verify loading, empty, unresolved, failed, and completed presentation.

### Visual Verification

Verify desktop and mobile import layouts, Recipe detail density, keyboard traversal, visible focus, reduced motion, long ingredient names, long methods, and common small/large result sets against the stored design references.

### Commands

Use the repository-owned Builder and codegen workflow only. After focused tests, run the smallest relevant type and formatting checks, followed by the required complete gate:

```powershell
bun run manifest:regen
bun run codegen
bun run dev:convex
bun run check:culinary-manifest
bun run typecheck
bun run format:check
bun run test -- tests/culinary-slice-contract.test.ts tests/culinary-manifest-integration-guard.test.ts
bun run check
```

Do not commit until concurrent Manifest/workforce work and its final generated gate are stable.
