# Progress: Live Event Profitability

## 2026-07-22

- Read the supplied project context and required planning, frontend-design, and Playwright skill instructions.
- Pinned branch, HEAD, worktree status, and Playwright prerequisite (`npx` is available).
- Checked memory registry for relevant prior profitability decisions; no direct matches were found.
- Found an existing completed Event Cost Summary report adjacent to this feature.
- Created feature-specific planning files to avoid overwriting other sessions' planning state.
- Read the current Event Detail and completed-event cost report implementations.
- Located the reactive list hooks and source Manifest entities for each requested live P&L input.
- Confirmed that raw time records do not carry rates and ingredient demands do not carry monetary values; continued tracing their governed valuation sources.
- Identified PayrollInput as the governed labor valuation and VendorOrderLineDemand × VendorOrderLine.unitCost as the strongest event-level committed ingredient valuation.
- Confirmed submitted-or-later vendor orders as the ingredient commitment boundary and identified the equipment catalog's valuation limitation.
- Chose an industrial live-ledger visual direction consistent with the neighboring event-cost folio and existing Capsule UI.
- Completed discovery and implementation planning, including exact status boundaries, incomplete-pricing behavior, planned files, and verification commands.
- Rechecked the Event Detail hash immediately before editing; it matched the inspected baseline.
- Added the pure live aggregation helper, reactive event widget, scoped responsive styles, and the narrow Event Detail integration.
- Reviewed the target diff. The Event Detail diff against HEAD contains substantial pre-existing user work; this feature's contribution is limited to one import and one widget render.
- Scoped Prettier formatting passed for all four implementation files.
- `bun run typecheck` passed.
- Confirmed the repository-local Playwright runner is present; the temporary browser fixture can use the actual React component with mocked reactive data.
- Continued from the existing feature-specific plan and reviewed the current helper, widget, styles, and Event Detail insertion before making further changes.
- Cross-checked the implementation against the live invoice, demand, procurement, payroll, and equipment Manifest definitions; identified payroll-query authorization and equipment valuation semantics as the two remaining audit risks.

## Verification Log

- `bun x prettier --write <four implementation files>` — passed.
- `bun run typecheck` — passed.
- Temporary Playwright attempt 1 — web server did not start because the config-relative Vite path was duplicated; corrected the command to `bun x vite --config vite.config.ts`.
- Temporary Playwright attempt 2 — timed out after 124 seconds while waiting for the configured web server, with no assertions run. Next step is a direct foreground Vite diagnostic and an explicitly managed server.
- Confirmed the timed-out runner left its exact disposable Vite child listening on 127.0.0.1:4187 (PID 13852) and returning HTTP 200. Reusing that verified server isolates the browser assertions from web-server lifecycle behavior.
- Playwright attempt 3 under `bun <playwright-cli>` produced no output for 40 seconds and was terminated before its outer timeout. The next attempt uses the installed CLI with Node, matching Playwright's runtime.
- Playwright attempt 4 reached the browser but the widget did not mount; the snapshot contained only the empty root. Removed Playwright-managed server lifecycle so the disposable Vite process can be inspected independently while browser assertions run.
- Verified the explicitly managed fixture server returns HTTP 200 for both HTML and transformed TSX. Attempt 5 still showed the empty root, so the temporary spec now captures browser page/console errors for a targeted fixture fix.
- Attempt 6 exposed the root cause: the Vite alias did not match the component's relative hook import, so real Convex hooks ran without a provider. Updated the temporary config to alias the exact import specifier.
- Temporary Playwright final run — passed 1/1 in Chromium. Verified $12,000 revenue, $568 committed cost, $11,433 initial margin, reactive update to $688 cost/$11,313 margin, and the 390px mobile layout.
- Visually inspected the mobile screenshot; hierarchy, wrapping, contrast, cost rail, and all three buckets rendered cleanly.
- Deleted the temporary Playwright spec, fixture, config, mock module, screenshot, and feature-specific directory; stopped the exact Vite child and confirmed port 4187 is free.
- `bun run check` — attempted; toolchain, ownership, proof, registry, and pin gates passed, then the unrelated Event Manifest guard stopped the run on seven pre-existing findings.
- `bun run build` — passed with existing chunk-size and mixed dynamic/static BEO import warnings.
- Final target diff check found no whitespace errors and no temporary verification files.
