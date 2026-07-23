# Client Portal Document Library

## Goal

Expose signed contracts, accepted proposals, current invoices, and the BEO as downloadable PDFs in the existing client portal without changing generated code or unrelated in-progress work.

## Constraints

- Preserve all pre-existing dirty and untracked work.
- Do not edit generated or Builder-owned files.
- Do not add permanent tests; the requested Playwright verification spec must be temporary and deleted after use.
- Follow existing client portal, PDF generation, auth/token, route, and styling patterns.
- Run the focused verification and `bun run check` before claiming completion.

## Phases

- [complete] 1. Inspect current portal, document generators, routes, auth, and working-tree overlap.
- [complete] 2. Define the smallest implementation and document the plan.
- [complete] 3. Implement the document library using authored seams only.
- [complete] 4. Review the diff and run focused static/unit verification.
- [complete] 5. Create, run, and delete a temporary Playwright verification test.
- [complete] 6. Run `bun run check`, archive the completed plan, and summarize.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| A parallel inspection tool call returned exit code 1 without output. | 1 | Switched to smaller sequential PowerShell inspections. |
| A PowerShell wildcard passed literally to `rg` caused a combined inspection to exit 1 after returning useful output. | 1 | Use concrete paths and tolerate optional no-match searches. |
| A second combined inspection repeated the literal PowerShell glob mistake for `src/**/*.manifest` and config wildcards. | 1 | Stop using shell-expanded globs with `rg` on Windows; pass directories plus `-g` filters or concrete filenames. |
| The first Playwright run used a non-exact `getByText("04")`, which also matched document reference substrings. | 1 | Use an exact text match for the library count and rerun the same download flow. |
| Post-pass review found that a missing BEO staff record could serialize as `undefined` in a Convex response. | 1 | Return explicit `null` and permit the PDF input to consume null or undefined. |
| Targeted Prettier check found a style-only difference in `convex/clientPortal.ts` after the null normalization. | 1 | Run targeted Prettier write on that authored file, then recheck. |
| `bun run check` stopped at pre-existing Event integration guard findings in `CommandFailure.ts`, `EventAllergenBriefingPage.tsx`, `EventIncidentPanel.tsx`, and `EventTimelinePanel.tsx`. | 1 | Preserve unrelated work; run the remaining relevant gates separately and report the repository blocker accurately. |
| Repository-wide `format:check` found 39 unrelated files under `.aboardai/**`, reviewer output, and `test-results`; feature-scoped formatting is clean. | 1 | Preserve external metadata/reviewer artifacts and report the baseline failure. |
| `bun run test:coverage` reported 518 passing and 13 failing tests from existing Event guards, stale mapping/navigation expectations, and the generated Invoice permission cascade. | 1 | Preserve unrelated generated/domain work and report the baseline failure. |
| `bun run baseline:decay` reported 58 root entries against a cap of 44. | 1 | Preserve unrelated concurrent root files; blocker is tracked by `Angriff36/capsule#47`. |
| The existing Vite server listens on IPv6 localhost, so the `127.0.0.1:7811` probe was refused. | 1 | Use the documented `http://localhost:7811` URL for browser verification. |
| The first temporary Playwright run reached the fixture URL but found no rendered document-library region. | 1 | Inspect the served HTML and browser error context, then correct only the disposable fixture harness before rerunning. |
| Browser diagnostics showed `@vitejs/plugin-react can't detect preamble` because an HTML fixture under `public/` is served without Vite transformation. | 2 | Serve the disposable HTML from `output/playwright/...` so Vite injects the React preamble. |
| The transformed fixture rendered, but the test looked for the region by eyebrow text instead of the heading referenced by `aria-labelledby`. | 3 | Target the region's actual accessible name, `Signed, settled, and close at hand`. |

## Implementation Plan

1. Extend the existing token-authorized Convex projection with only the record fields required to render event-bound client documents.
2. Filter the library to `signed` contracts, `accepted` proposals, and published invoice states (`sent`, `viewed`, `overdue`, `partial`, `paid`); never expose drafts, voided, or written-off invoices.
3. Keep the current event's BEO available as a live PDF snapshot and reuse the existing BEO content model.
4. Reuse the proposal, invoice, and BEO jsPDF builders through narrow structural input types; add a matching programmatic contract PDF builder.
5. Add a responsive document-library section with per-document download feedback and no extra approval workflow.
6. Verify real browser downloads from a disposable component fixture, then delete every temporary source/spec file.
