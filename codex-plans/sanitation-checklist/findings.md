# Findings & Decisions: Sanitation Checklist

## Requirements
- Define daily, weekly, and monthly sanitation tasks.
- Organize definitions per operational zone, including prep surfaces, equipment, and storage.
- Materialize checklist instances on a schedule.
- Record completion with a staff signature.
- Generate a compliance summary for the last inspection window.
- Follow current Capsule authored/generated boundaries.
- Verify the core flow using a temporary Playwright test, then delete that test.
- Run the required repository gate before claiming completion.

## Research Findings
- The checkout already contains a very large pre-existing dirty tree, including generated outputs and multiple untracked feature areas.
- No prior sanitation-specific memory record was found in the quick memory pass.
- Repository rules require `bun`, `bun run manifest:regen` as the sole regeneration entry, and `bun run check` as the completion gate.
- Facilities currently has one authored domain module, `src/facilities/equipment.manifest`, plus a single `/facilities` route rendering `EquipmentCatalogPage`.
- `src/app.manifest` is the root compile entry and directly imports each authored domain module; a sanitation module belongs there rather than daisy-chaining through another feature module.
- Existing recurring equipment maintenance models a definition (`EquipmentMaintenanceTask`) and immutable completion history (`EquipmentServiceEntry`), but it advances one due date rather than materializing daily/weekly/monthly checklist instances.
- Existing quality checks record the acting staff member from authenticated `user.id`, which is a useful signature pattern with less user tedium than asking staff to retype their name.
- The current generated `convex/crons.ts` reports zero jobs, and no authored Manifest cron syntax exists in this checkout; scheduled materialization will need an authored Convex seam unless current Manifest documentation proves a supported source construct.
- A Vite server is already running on the documented local port path, matching the requirement to verify without restarting the app.
- Multiple Codex/Claude/Node processes are live and generated files changed shortly before discovery, so concurrent-session overlap must be ruled out before touching shared route/root/generated files.
- Process command lines confirm at least two earlier Codex sessions and one Claude session remain active while this run is executing. Because Capsule's repository instructions explicitly require stopping when another session is actively rewriting the tree, implementation cannot safely proceed in this checkout.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Place sanitation in a new authored facilities Manifest module | It is facility-wide operational work and avoids bloating or colliding with the currently modified equipment source. |
| Use the authenticated staff identity as the completion signature | It is attributable, tamper-resistant, and avoids unnecessary re-entry. |
| Do not restart the existing dev server | Repository context says to assume it is already running for UI verification. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Active concurrent agents in the shared dirty checkout | Stop before shared source edits and ask the owner to rerun after those sessions finish or provide a separate clean checkout. |

## Resources
- `AGENTS.md`
- `.aboardai/context/codex-implementation.md`
- `.aboardai/context/computer-use.md`
- `.aboardai/context/review-changes.md`

## Visual/Browser Findings
- None yet.
