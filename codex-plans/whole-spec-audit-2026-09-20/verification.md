# Planning verification

Audit started 2026-09-20; synthesis completed 2026-09-21 against application source at `dev` / `be4288fb`. No application code, generated output, test code, deployment settings or production state was changed.

- Source inventory: all 22 files recursively under `specs/`, including the normative Markdown/JSON mirror and owner-owned untracked backend contract. Hashes are in `source-coverage.json`.
- Shared library: all 115 files recursively under `src/lib/`, including generated wiring and fixture metadata/consumers; see `shared-library.md`.
- Acceptance: 727 unique stable IDs, AC-001 through AC-727. Original AC-001 through AC-046 outcomes preserved; no deletions or renumbering. AC-012/024/029/030 reopened documented incomplete proof. 40 PASS, 687 PENDING.
- Plan: 115 pending task groups. Every pending criterion appears in at least one task, every referenced ID exists, and every spec has mapped criteria.
- Exact source checks: all 164 Ralph acceptance checkboxes mapped. Backend: golden 22, cancellation 9, security roles 13, concurrency/recovery 8, replacement 7, definition of done 15, first implementation checkpoint 9. Packet: office question groups 15, field forms 10, ordered sections 8.
- Read-only worker reports were inspected and corrected. Provider-error outputs from workers 007/015 were rejected; orchestrator recovered 007 and worker 017 recovered the packet scope. No worker committed, pushed or edited application/test files.

Validation executed against the preserved application tree:

| Check | Result |
| --- | --- |
| `bun run check` | BLOCKED: ownership/proof/domain/design/typecheck passed, then formatting failed on startup-owned `loop-ledger.json`. |
| `bun run test:coverage` | PASS: 193 files, 892 tests; coverage thresholds passed. |
| `bun run build` | PASS: frontend build; chunk-size warning only. |
| `bun run secrets` | PASS before planning checkpoint; pre-commit repeats for staged files. |
| `bun run manifest:regen:check` | PASS: repository-local Builder reports no drift. |
| `bun run baseline:decay` | BLOCKED: 75 root entries versus 71 cap; local worker artifacts, owner source spec and ignored plan backup account for the difference (#380). |
| `bash lint_specs.sh specs/ralph` | PASS: all 19 Ralph specs well formed. |
| Planning source-map/ID checks | PASS: source coverage, stable old outcomes/IDs, no orphan pending criteria, explicit suite counts and full library inventory. |
| Owned JSON formatting | PASS: `bunx prettier --check codex-plans/whole-spec-audit-2026-09-20/source-coverage.json`. Markdown preserves author formatting by repository policy. |

Local preview was started and rechecked with `powershell.exe -NoProfile -File ./ralph-preview.ps1 -Port 7813`; its Vite source map identifies `C:/Projects/capsule/src/main.tsx`, not just an HTTP 200. URL: http://127.0.0.1:7813. Frontend listener PID 45384. Served frontend source selects local Convex `127.0.0.1:3210`; backend PID 55244 has Convex dev parent PID 55200 and storage paths in this checkout. `authStatus:getAuthStatus` returned `status: success`, `authenticated: false` as expected for the anonymous probe. No credentials were recorded in this receipt.

`.ralph.env` already contained `RALPH_PREVIEW_CHECK_CMD='powershell.exe -NoProfile -File ./ralph-preview.ps1 -Port 7813'`; it was preserved and the command passed. Existing port 7811 and unrelated processes were left running. Process ownership and served source establish local checkout identity, not authenticated full-product or production qualification.

Required upstream `89262916f59e32dbed5d63749999309a62586742` was already an ancestor; `git pull --no-rebase origin dev` was up to date. No integration changed dependencies. Startup-owned file hashes remained identical except the explicitly requested plan target. The owner-owned backend spec and recovery document remain untracked and are not part of the planning checkpoint.

The full repository gate remains blocked; this receipt certifies the planning audit and the named narrower checks only. A dev push is not a production deployment. Open lifecycle meaning and business-source decisions are visible in the plan; no default selection is represented as owner approval.

Document consistency review: worker 018, `glm-5.3-flash`, **APPROVE**, 2026-09-21. It reproduced the 727 IDs, unchanged original 46 outcomes, four reopenings, 687 pending-task links, all 164 checkbox mappings, explicit backend suite counts, 22 source hashes and 115 library files. The orchestrator read the verdict and independently reproduced these checks. See `review-decisions.md` for its ignored scratch-helper write and the limits of this review; it is not the required independent implementation merge approval.
