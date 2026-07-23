# Fixes: Recurring event scheduling

Append resolved implementation or verification issues here; do not overwrite prior entries.

## 2026-07-22: Preserve encrypted contact envelopes
- **Symptom:** TypeScript rejected assumed `primaryContact*KeyId` fields while cloning a source Event.
- **Cause:** Generated encryption stores the key id inside the serialized `{v,kid,ct}` field envelope, not in companion columns.
- **Fix:** Clone only schema-declared encrypted fields from the raw source document.
- **Verification:** `bun run typecheck` passes.

## 2026-07-22: Make occurrence counts whole-number contracts
- **Symptom:** The initial command parameter accepted any number even though generated occurrence sequences are integral.
- **Cause:** `configureRecurrence.occurrenceLimit` and recurrence event payloads used Manifest `number`.
- **Fix:** Changed occurrence limits and generated-count payloads to Manifest `int`, then regenerated through Builder.
- **Verification:** `bun run manifest:regen`, `bun run codegen`, `bun run typecheck`, and the focused Playwright test pass.

## 2026-07-22: Temporary Playwright verification
- **Symptom:** The feature required browser-level proof without adding a permanent test.
- **Fix:** Mounted the production presentational panel in a temporary Vite/Playwright harness, exercised configure/stop/lineage behavior, captured a screenshot, and deleted all harness files after the pass.
- **Verification:** One Playwright test passed; `output/playwright/recurring-event-verification` contains no files.
