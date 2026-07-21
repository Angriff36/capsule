# No invented deferrals or scope ceilings

**Status:** Binding for Capsule agents  
**Created:** 2026-07-21  
**Audience:** AI agents and humans writing Capsule product/docs/UI

## The failure mode

Agents invent “deferred,” “out of scope,” “not part of this slice,” or a
tiny allowlist, then treat their own wording as owner law. The human has to
fight to get work that was never actually forbidden.

Proven examples (2026-07-21):

- Saved-report **chart rendering** labeled deferred in UI/docs by Cursor slice
  commit `bb2ffae` — no signed owner deferral exists.
- Capsule MCP capped to `AGENT_AC_CAPABILITY_IDS` and justified with AC
  “out of scope for done” language — that text was a **minimum proof set**,
  not a ban on the rest of the product.

## Rules

1. **Not built ≠ deferred.** Say “not built yet” or build it. Do not write
   “deferred” / “out of scope” unless the owner said so in chat or a dated
   owner-marked decision.
2. **No phantom ODs.** Do not cite `ODxxx` as deferral authority unless a
   real decision doc exists in-repo. A one-line comment is not a decision.
3. **AC minimum ≠ product ceiling.** Acceptance tables and north-star demos
   are the floor for “done,” not a permanent allowlist. Do not shrink MCP,
   UI, or domain coverage to match an AC table unless the owner asks.
4. **Do not make the human re-authorize obvious progress.** If a surface
   exists (e.g. `/reports` definitions), finishing the obvious user-visible
   next step (e.g. show the chart) is in scope unless blocked by a real
   technical dependency you state clearly.
5. **Fix the source.** If you find agent-invented “deferred” in UI/docs,
   strike or rewrite it before moving on.

## Anti-patterns

- Commit messages / UI copy: “X stays deferred” with no owner ask
- “Full domain coverage out of scope” used to refuse wiring already in IR
- Leaving stale “remain deferred” / “charts not drawn yet” footers after the
  feature shipped (fixed for `/reports` live results on 2026-07-21)
- Asking the human to approve each inch that only an agent previously blocked

## Related

- `docs/architecture/escalate-blockers-to-github.md` — blockers must become
  GitHub issues; workarounds are not escalation
