# PR01 — Import a complete source archive

_Serves JTBD(s):_ Josh — replace TPP with imports that reconcile.

## Job Statement

Upload a TPP archive once, then let Capsule account for every source record without terminal scripts or repeated manual imports.

## Baseline and ownership

Draft requirements, 2026-09-05; read the shared contract in [production readiness](../../docs/product/production-readiness.md). Existing owners: `src/import/import-run.manifest`, `src/import/external-record-link.manifest`, `convex/quickImport.ts`, `convex/importCommit.ts`, `src/lib/tppReports/xlsxReader.ts`, and `src/features/admin/import/`. Import actions exist; today's 90-workbook migration required ignored scripts, source-specific adapters, and external receipts. Issue #274 covers report layout/date parsing; #241 covers partial bundle resume. A successful batch is not archive completion.

## Required behavior

Extend the existing import workflow with a durable archive manifest, source artifacts, parse versions, row/section provenance, checkpoints, and per-record outcomes. Source storage must belong to the tenant/import, not an arbitrary customer's event. Reuse governed commands for materialization; no second write API. Preserve original bytes and raw values separately from interpreted values. A source artifact is evidence, not proof of normalized data.

## Acceptance Criteria

- [ ] PR01-01: Upload the 90-workbook regression archive with an index describing 70 reports; Capsule inventories all 90 and explains the discrepancy before commit.
- [ ] PR01-02: Every workbook has a disposition: normalized, linked reference, duplicate view, needs mapping, unsupported, or invalid. Every data row/section has a counted outcome; headers and summaries are classified separately. Counts reconcile without silently dropping rows.
- [ ] PR01-03: Originals, checksum, workbook/sheet/cell or section coordinates, raw text/value, date system, parser version, and normalized result are inspectable from the import record by an authorized operator.
- [ ] PR01-04: Reuploading identical bytes, restarting a worker after a committed command, or opening the run from another device creates no duplicate business records. A changed source revision produces an explicit delta, not a second copy.
- [ ] PR01-05: A failure after any parent or child write resumes missing children, deposits, lines, and attachments without replacing newer user edits. Fault injection at each checkpoint proves this behavior.
- [ ] PR01-06: Excel 1900/1904 date systems, leap-day behavior, fractional-day times, timezones, sparse/merged cells, accounting parentheses, fractions, and missing formulas' cached values are handled explicitly. Missing units are not inferred from unrelated cells; formulas/macros are never executed.
- [ ] PR01-07: Zip traversal, absolute paths, nested archive abuse, excessive expanded bytes, duplicate filenames, encrypted workbooks, and corrupt entries produce bounded, named failures without writes outside source storage. Limits and progress are visible before expensive processing.
- [ ] PR01-08: Closing the browser does not stop a committed run. Cancel stops unstarted work; compensation affects only unchanged records owned by the run and reports anything requiring correction instead of deleting later user work.
- [ ] PR01-09: Archive success requires zero unaccounted records. Partial/unsupported/reference-only content remains visible; no completed badge implies all source data became operational records.

## Dependencies and proof

PR12 governs source access; PR13 supplies worker/recovery infrastructure. PR02–PR05 own semantic mapping. Start with archive inventory and resume proofs before expanding dataset coverage. Use sanitized fixtures shaped like the private exports; never commit customer files or private receipts.

## Out of Scope

No product capability is excluded. Identity, recipe, stock, and accounting semantics belong to PR02–PR05; this spec owns their shared import lifecycle.

## Open Questions

Source retention duration requires an owner-selected setting before automatic deletion is enabled. Preserve sources by default; this does not block import or reconciliation.
