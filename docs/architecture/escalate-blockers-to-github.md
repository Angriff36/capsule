---
source_of_truth: true
created: 2026-07-21
updated: 2026-07-23
status: Binding for Capsule agents
---

# Escalate blockers to GitHub — do not ignore them

**Status:** Binding for Capsule agents  
**Audience:** AI agents and humans hitting product/tooling failures mid-task

## The failure mode

Agents hit a real blocker (schema drift, broken command path, stale MCP host,
auth remint gap, idempotency trap), then **work around it silently**, mark the
user task partial, and move on. The human never gets a durable ticket. The
next agent hits the same wall.

Proven example (2026-07-21 kitchen wipe) — issues filed only after this rule:

- Schema drift blocking cancel/remove/retire → [#15](https://github.com/Angriff36/capsule/issues/15)
- Stale Capsule MCP capability catalog → [#16](https://github.com/Angriff36/capsule/issues/16)
- enter-recipe idempotency returns retired recipe ids → [#17](https://github.com/Angriff36/capsule/issues/17)
- `Ingredient.discontinue` ≠ wipe / no catalog reset → [#18](https://github.com/Angriff36/capsule/issues/18) (**resolved 2026-07-23:** use `Ingredient.purge` / Kitchen **Delete**; discontinue remains lifecycle-only)
- No `Recipe.reinstate` → [#19](https://github.com/Angriff36/capsule/issues/19) (draft PR path; reinstate + enter-recipe reinstate shipped on loop branches)

Agents had reminted JWT / switched CLI / reinstated ingredients and originally
filed **zero** GitHub issues — that is the failure this rule forbids.

**Partial fix note (2026-07-21):** enter-recipe now refuses retired Recipe ids
from document-hash idempotency (`CapsuleDocumentEnterCoordinator` +
`CapsuleRecipeStatusLoader`). Dish.introduce can still return a retired dish
via the same idempotency class — use a new key or extend the same check; see
[#17](https://github.com/Angriff36/capsule/issues/17).

**Catalog wipe note (2026-07-23):** Do not treat `Ingredient.discontinue` as a
wipe. Kitchen catalog **Delete** maps to `Ingredient.purge` / `Dish.purge` /
`Recipe.purge` (soft-hide with `deletedAt`). Reinstate from the list with
**Show retired**.

## Rules

1. **Blocker ⇒ GitHub issue in `Angriff36/capsule` before you leave the
   topic.** Same session. Do not wait for the human to ask.
2. **Workarounds are not escalation.** Using `agent:llm-tools` because MCP is
   stale, reminting JWT by hand, or skipping event cancel because schema
   rejects the row is a **temporary bridge**. The issue must still be filed.
3. **One issue per distinct root cause** (schema drift ≠ stale MCP ≠
   idempotency). Link related issues. Do not dump an essay into one ticket.
4. **Issue body must include:**
   - What you were trying to do (user ask)
   - Exact failing command / capability id / tool name
   - Error text (trimmed) or observed behavior
   - Evidence pointers (file paths, request ids, doc ids when safe)
   - What workaround you used (if any)
   - Suggested fix owner: Manifest regen / Capsule agent / Convex data repair /
     Cursor MCP refresh — state your best guess, do not invent deferrals
5. **Labels:** use `bug` for broken paths; `enhancement` only for missing
   product commands (e.g. no `Recipe.reinstate`). Add others only if they
   already exist.
6. **Tell the human the issue URL(s)** in the work report / chat reply. Pasting
   “blocked” without a link is a rule violation.
7. **Do not “note it” in chat or memory only.** Chat is not the backlog.
   `gh issue create` (or equivalent) is the escalation.

## Anti-patterns

- “Events couldn’t cancel; continuing with recipes” with no issue
- “MCP catalog stale — used CLI instead” with no issue
- Writing a private `.artifacts/` dump and treating that as tracked
- Closing the loop with work-report “Shortcuts” that list blockers but never
  open tickets
- Asking the human to remember to file the bug

## Related

- `docs/architecture/no-invented-deferrals.md` — do not invent “deferred”
- `docs/generation/capsule-agent-mcp.md` — MCP / JWT remint notes
