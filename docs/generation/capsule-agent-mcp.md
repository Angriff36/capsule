# Capsule agent MCP (command bridge)

**Created:** 2026-07-17  
**Binding AC:** [2026-07-17-command-api-surface-boundary.md](./2026-07-17-command-api-surface-boundary.md)

Thin transport for IDE agents. Tools call the **same** Convex `createVia*` /
command mutations and authz as a logged-in Capsule user — **not** “only what
screens exist today,” and **not** a hand-picked subset of the domain. The
catalog is the full Manifest wiring contract (every capability with a Convex
mutation). `AGENT_AC_CAPABILITY_IDS` is only the north-star demo proof set.

**UI gap warnings:** `CAPABILITY_UI_SURFACES` in
`src/agent/CapsuleCommandUiCoverage.ts` records which AC commands have an
authored feature call site. List/describe/execute (and snake tools) still
**allow** the command, but when `uiImplemented` is false MCP returns a **red
ANSI banner** (`NO UI IMPLEMENTATION`) in the tool result (visible in Cursor
tool output) plus `uiGapWarning` / `uiGaps` in the JSON for the agent. Tool
descriptions are also prefixed with `⚠️ NO UI`.

## Tools

| Tool                           | Purpose                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_capsule_commands`        | Discover **all** wiring capabilities from `manifest-wiring-contract.json`                                                                                                                                                                                                                  |
| `describe_capsule_command`     | Params + mutation name + emits for one capability                                                                                                                                                                                                                                          |
| `execute_capsule_command`      | Run any catalog capability (`args` + optional `idempotencyKey`)                                                                                                                                                                                                                            |
| `get_capsule_llm_tools`        | Dump Anthropic/OpenAI tool defs (wiring + agent-sdk snake names)                                                                                                                                                                                                                           |
| `execute_capsule_llm_tool`     | Generic execute by snake name (prefer first-class tools below)                                                                                                                                                                                                                             |
| `recipe_draft`, …              | First-class MCP tools for every wiring capability (snake names, Zod schemas)                                                                                                                                                                                                               |
| `preview_recipe_document`      | Parse only — inspect lines/yield before writing                                                                                                                                                                                                                                            |
| `enter_recipe_document`        | Write createVia path for a **Recipe** sheet; requires `approveUnresolvedAsNew` for new ingredients. Default does **not** create a Dish (`introduceDish` opt-in only). Dish shape = production sheet + DishTasks — see `work/list*.jpg` and `docs/event-prep-and-weekly-order-workflow.md`. |
| `add_event_dish_and_sync_prep` | Add EventDish + PrepTask template sync (`skipDemand`; Manifest owns demand)                                                                                                                                                                                                                |
| `capsule_query`                | Allowlisted Convex reads (demand/prep/needs/orders) for cascade verify                                                                                                                                                                                                                     |

AC snake tools include required Convex `docId` (+ optional `version`) for
non-`createVia` instance commands (e.g. `ingredientdemand_confirm`).

## Programmatic LLM bridge

`CapsuleAgentToolBridge` / `CapsuleLlmToolDriver` in `src/agent/llm/`:

- `getToolDefinitions("anthropic" | "openai")` — schemas from wiring; names via
  `@angriff36/manifest/agent-sdk` `mangleToolName` (not in-process `RuntimeEngine`)
- `executeToolCall` → `ConvexCommandClient` / same mutations as the UI
- Introspection builtins use MCP-aligned names: `list_capsule_commands`,
  `describe_capsule_command`

LLM tool dump / `--call` helpers live in `src/agent/llm/`
(`CapsuleLlmToolDriver`). There is **no** `package.json` script named
`agent:llm-tools` or `agent:mcp:verify` in this checkout — use the MCP host
below (or call the driver from a one-off `bun` script).

## Setup

1. Convex + Clerk working for the UI (session token claims `role` + `tenantId`).
2. Sign into Capsule with a workspace org, then: `bun run agent:mint-jwt`
   (writes `CAPSULE_AGENT_JWT` into `.env.local`).
3. Ensure `CONVEX_URL` is set.
4. Cursor MCP is wired locally (do not hand-edit unless paths change):
   - Project: `.cursor/mcp.json` (gitignored)
   - User: `~/.cursor/mcp.json` entry **`capsule`**
   - Committed template: [cursor-mcp.capsule.example.json](./cursor-mcp.capsule.example.json)
   - Launcher `chdir`s to the Capsule repo and loads `.env.local` even if Cursor
     omits `cwd` (that was the live discovery failure mode).
5. Start the stdio host: `bun run agent:mcp` (idle in a TTY is expected).
6. In Cursor: Settings → MCP → enable/refresh **`capsule`**. Prefer
   `list_capsule_commands` + `execute_capsule_command` (or
   `get_capsule_llm_tools` + `execute_capsule_llm_tool`). The host does **not**
   register one MCP tool per capability — that froze `tools/list` at startup
   (#16). Catalog JSON is reloaded from disk when
   `manifest-wiring-contract.json` changes, so regen updates are visible without
   restarting for list/execute. Restart the host only if the process itself is
   stuck. Do **not** expect `bun run agent:mcp` in a normal terminal to print a
   prompt — stdio host only.
7. Live writes need Convex up (`bun run dev:convex`). Clerk session JWTs expire
   in ~60s; `ConvexCommandClient`, `CapsuleIngredientCatalogLoader`,
   `CapsuleQueryClient`, and `CapsuleLiveEventPrepStateLoader` remint via
   `CLERK_SECRET_KEY` on each call when the token in `.env.local` is stale
   (same path as `agent:mint-jwt`). After changing that remint code, refresh
   the Cursor **`capsule`** MCP server so the long-lived stdio host reloads.
8. Datetime client params are ISO strings in MCP schemas; `ConvexCommandClient`
   coerces them to epoch ms before Convex mutations (same as UI
   `new Date(...).getTime()`). Manifest `list` / `T[]` params are JSON arrays.
9. Prove the event→demand→weekly draft cascade by calling MCP tools in-session
    (`ingredient_introduce` → … → `event_approve`, then `capsule_query` read-back).
    Do not wrap that path in a separate smoke script — the MCP tools are the test.

### Cursor MCP config (wired shape)

```json
{
  "mcpServers": {
    "capsule": {
      "command": "C:/Users/Ryan/AppData/Roaming/npm/node_modules/bun/bin/bun.exe",
      "args": ["run", "C:/Projects/capsule/scripts/capsule-mcp.ts"],
      "cwd": "C:/Projects/capsule",
      "env": {
        "CAPSULE_MCP_BOOT": "jwt-session-v1"
      }
    }
  }
}
```

Secrets stay in `.env.local` (`CONVEX_URL`, `CAPSULE_AGENT_JWT`).

## Agent prompt (copy-paste)

Use the locked prompt in
[AGENT_PROMPT_ENTER_RECIPE.md](./AGENT_PROMPT_ENTER_RECIPE.md)
(`bun run agent:enter-recipe` — works without MCP).

## Proof

```bash
bun run test tests/agent/capsule-command-catalog.test.ts tests/agent/capsule-agent-tool-bridge.test.ts tests/proofs/agent-document-enter.runtime.test.ts tests/proofs/agent-llm-tool-bridge.runtime.test.ts
```

Document-enter + LLM bridge createVia/confirm are proven under `convex-test`
without a live JWT. Live MCP tool calls require `CAPSULE_AGENT_JWT`.

## Out of scope here

- Manifest `@manifest/mcp-server` (authoring compile/execute on IR — not Capsule persistence)
- Partner/mobile public HTTP product packaging beyond the emitted `/api/manifest/` dispatcher
- OCR of scanned cookbooks
- Full in-app chat UI (MCP snake tools + `CapsuleLlmToolDriver` are the consumers)

`add_event_dish_and_sync_prep` does not submit purchasing. It creates the
EventDish through `EventDish.addToEvent`, then materializes PrepTasks from
active DishTask templates (`skipDemand: true` — host sync does **not** write
IngredientDemand). Manifest reactions on EventDish expand DishRecipe →
RecipeIngredient into calculated `IngredientDemand`. On `Event.approve`,
eligible demand routes into PurchaseNeed → a shared weekly VendorOrder DRAFT.
Verify with `capsule_query` (allowlisted reads). See
[event-prep-and-weekly-order-workflow.md](../event-prep-and-weekly-order-workflow.md).
