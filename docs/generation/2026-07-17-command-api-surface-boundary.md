# Command API surface — Capsule consumption

**Created:** 2026-07-17  
**Status:** Binding for Capsule external write paths (assistants, partners,
provider callbacks) and for not inventing a parallel “AI API.”

**Canonical Manifest plan:**  
`C:/Projects/Manifest/docs/internal/plans/2026-07-17-command-api-surface-boundary.md`

---

## Direction (do not invert)

| Construct                      | Direction          | Capsule use                                                            |
| ------------------------------ | ------------------ | ---------------------------------------------------------------------- |
| Manifest `webhook`             | **Inbound**        | Provider callbacks → command                                           |
| Dispatcher / command mutations | **Inbound**        | Assistants, partners, mobile → **same** command contract as UI         |
| `publish` / outbox / EventBus  | **Outbound**       | Notify outside systems after a command succeeds                        |
| Outbound partner `POST` URL    | **Not native yet** | App/worker until Manifest adds a projection — never overload `webhook` |

---

## One contract

```text
Manifest IR commands
        |
  ┌─────┴──────┐
  UI (Convex)  External (HTTP / agent tools)
  same guards, policies, params, emits
```

No separate AI rules. Prefer capability commands (`Recipe.draft`,
`RecipeImport.upload` + review/finalize lifecycle) over CRUD on tables.

Wiring already catalogs  
`POST /api/manifest/{Entity}/commands/{command}`  
in `src/generated/manifest-wiring-bindings.ts`. Live public HTTP is still a
product gap (`convex/http.ts` currently has zero webhook/command routes).

---

## Capsule rules

1. External actors execute **commands**, not raw entity writes.
2. Auth must become Manifest `RuntimeContext` (actor/tenant/org) before
   `runCommand` / generated mutation — same as UI.
3. Provider inbound → `webhook` decls when the projection path is proven; do not
   hand-roll HMAC/idempotency.
4. Outbound notifications → emits + outbox/EventBus (or explicit workers), not
   `webhook`.
5. Do not add `ai-api` / ChatGPT-only surfaces with different authz.
6. Pin / proof-kit: `docs/generation/2026-07-16-dx-proof-kit-boundary.md`.

---

## Acceptance criteria (product done)

**North star:** In a Cursor/IDE agent chat, you can point at recipe (or ops)
documents and instruct the agent to enter the kitchen/ops data into Capsule —
without opening the Capsule UI — and the data lands through **the same
governed commands** the UI uses.

### Must pass (all)

1. **Document → Capsule, agent-driven**  
   Given a local or attached recipe/ops document (e.g. pasted text, `.txt`,
   PDF/export the agent can read), an agent with Capsule credentials can create
   durable records without a human clicking `/kitchen/**`.

2. **Capability commands only**  
   Writes go through generated Manifest commands (Convex mutations and/or live
   dispatcher), never direct table inserts or a parallel “AI CRUD” API.  
   Minimum command coverage for the north-star demo:

   | Domain                   | Create / enter via (verified wiring today)                  |
   | ------------------------ | ----------------------------------------------------------- |
   | Ingredient               | `Ingredient.introduce`                                      |
   | Recipe                   | `Recipe.draft` (+ `RecipeIngredient.add` as needed)         |
   | Recipe import provenance | `RecipeImport.upload` → review/finalize lifecycle           |
   | Dish                     | `Dish.introduce`                                            |
   | Menu (optional in demo)  | `Menu.draft`                                                |
   | Prep list / prep work    | `PrepTask.open` (and claim/start/complete as needed)        |
   | Event                    | `Event.planEngagement` (+ `EventDish.addToEvent` as needed) |

3. **Same authz as UI**  
   Agent calls fail closed without a valid actor/tenant context. Policies/guards
   that block the UI also block the agent. No god-mode agent bypass.

4. **Discoverable contract**  
   The agent can list or load the command contract for those capabilities
   (names, required params, errors) from a generated surface (wiring bindings,
   agent-sdk tools, OpenAPI, or MCP wrapper of the **same** tools) — not from
   hand-written prompt lore.

5. **Idempotent / safe retry**  
   Retries of the same logical enter operation do not duplicate recipes/dishes
   when the caller supplies an `idempotencyKey` (Convex projection support).

6. **Human-verifiable result**  
   After the agent run, a human can open Capsule UI (or query the same read
   path) and see the entered ingredients, recipes, dishes, prep tasks, and/or
   events with correct linkage (e.g. dish→recipe, event dish→dish).

7. **Proof, not anecdote**  
   At least one automated proof (runtime test or scripted agent smoke under
   `tests/` / `.artifacts/`) shows: fixture document → command sequence →
   persisted entities. Manual-only demos do not close this AC.

### Explicitly out of scope for “done”

- Perfect OCR / vision of scanned cookbooks (agent may require readable text).
- A separate ChatGPT-only API with different rules.
- Outbound partner webhooks (`RecipeDrafted` → POST URL).
- Full Capsule domain coverage beyond the table above (sales, payroll, etc.).

### Demo script (acceptance walkthrough)

1. Place a sample recipe document in the workspace (or paste into the agent).
2. Prompt: enter this as ingredients + recipe (+ dish if stated) into Capsule;
   open a prep task and/or draft event if the doc implies service.
3. Agent authenticates, selects commands from the contract, executes them.
4. Capsule UI shows the new records; duplicate prompt with same idempotency key
   does not create a second recipe.

### Status (2026-07-17)

| AC                                       | Status                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Document → Capsule (recipe + dish path)  | **Met in proof** — `CapsuleDocumentEnterCoordinator` + `tests/proofs/agent-document-enter.runtime.test.ts`            |
| Capability commands only                 | **Met** — catalog maps to `api.mutations.*` createVia only                                                            |
| Same authz as UI                         | **Met in proof** (role denial); live MCP uses Clerk JWT → `getAuthContext`                                            |
| Discoverable contract                    | **Met** — `list_capsule_commands` / wiring JSON                                                                       |
| Idempotent retry                         | **Met in proof** — same document re-enter keeps one recipe/dish                                                       |
| Human-verifiable                         | **Met live** — enter-recipe returned recipe/dish ids; visible in Capsule UI                                           |
| Automated proof                          | **Met** — catalog unit + document-enter runtime proof                                                                 |
| Live IDE agent without UI                | **Met (preview-first)** — `--preview` then `--approve-new`; unresolved lines refused by default                       |
| PrepTask / Event from a recipe doc alone | **Partial** — use `execute_capsule_command` / mutations with `eventId`/`clientId`; not auto-inferred from recipe text |

`convex/http.ts` remains empty (no public HTTP dispatcher yet). Shell CLI is the
primary IDE path; MCP is optional (`agent:mcp`).
