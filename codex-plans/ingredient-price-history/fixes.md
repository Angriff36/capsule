# Fixes Log: Ingredient purchase price history

## 2026-07-22

- Issue: An optional no-match memory search caused the first combined discovery command to fail.
  Fix: Read required skills separately and make optional searches return success.
  Command: `rg ...; exit 0`
- Issue: PowerShell passed `src/**/*.manifest` literally to `rg`.
  Fix: Search `src` or a concrete manifest path.
  Command: `rg -l "entity VendorOrder|command recordReceipt" src`
- Issue: Nested quoting produced an invalid `rg` policy regex.
  Fix: Inspect the concrete source and choose a design that does not require special command-level policy syntax.
  Command: `Get-Content src/procurement/order.manifest`
- Issue: Prettier has no parser registered for `.manifest` files.
  Fix: Format only supported TS, CSS, and Markdown paths; validate Manifest through regeneration.
  Command: `bunx prettier --write <supported files>`
- Issue: The generated match branch reruns `IngredientPriceObservation.record`; a strict new-row-only guard made an event replay fail.
  Fix: Permit an exact same-payload replay while preserving `observedAt`; reject all differing payloads.
  Command: `bun run manifest:regen`
- Issue: No root `playwright.config.ts` exists.
  Fix: Invoke Playwright with the temporary spec path and default configuration.
  Command: `bunx playwright test <temporary-spec> --workers=1`
- Issue: A combined PowerShell command that started and force-stopped Vite was rejected by command policy.
  Fix: Start Vite as a yielded tool cell, run Playwright separately, then terminate that exact cell through the tool.
  Command: `bun run dev -- --host 127.0.0.1 --port 7811`
- Issue: `bun run check` stops at `check:event-manifest` on direct Convex access in unrelated Event files.
  Fix: Preserve the concurrent files, confirm the existing GitHub escalation, and report the full gate as blocked while retaining feature-specific passing checks.
  Command: `bun run check`
- Issue: The existing governed-creation inventory did not include the new generated `IngredientPriceObservation_createViaRecord` mapping.
  Fix: Add that one generated mapping to the existing expected catalog without adding a test.
  Command: `bun run test tests/governed-creation-mappings.test.ts`
- Issue: Repository-wide `git diff --check` reports trailing spaces in unrelated pre-existing `AGENTS.md` and `docs/commands.md` edits.
  Fix: Preserve those user changes and use the passing targeted Prettier check for feature files.
  Command: `bunx prettier --check <feature files>`
- Issue: PowerShell treated `-or` as a `Test-Path` parameter in a combined temporary-file assertion.
  Fix: Use individual parenthesized checks or enumerate exact names.
  Command: `Get-ChildItem <temporary names> -ErrorAction SilentlyContinue`
