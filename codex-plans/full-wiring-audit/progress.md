# Full wiring audit progress

2026-09-06: created isolated work branch from deployed main; read binding no-fake-data spec; launched three read-only domain audits. Existing codex-plans files belong to older tasks and remain preserved. No app code changed yet; no run or deployment started.
# 2026-09-06 implementation update

Three independent static audits completed; confirmed findings are preserved in findings.md and expanded into eight repair groups in task_plan.md. Task 1 committed as a7b5b98 with 141 files / 1303 tests and typecheck passing, awaiting independent task review. Root noted source-string tests may not prove interaction behavior; reviewer is checking that requirement before acceptance. Full app task is not complete.

Root generated-contract scan checked 335 direct calls against 591 generated docId-required hooks; three known missing-docId calls only. Adapter/reference audit is ongoing. Seed issue #113 received a source-evidence refresh: entrypoint and promoted create coverage fixed, authentication and actual reference resolution still unproven/broken by inspection. No production mutations or deploys.

Adapter audit completed: all enumerated references/dynamic arguments target docId correctly. Task 1 independent review requested honest historical queued wording/persistent unavailable guidance and actual component interaction tests; implementer is fixing both. Read-only local listener check found existing services on 3210/3211 and 7811; their checkout ownership has not yet been verified and no service was restarted or stopped.

Tasks1 and2 now independently approved by gpt-5.6-terra. Task2 commits2514043/9093eed: explicit KDS actual yield, route/vendor/revenue provenance labels, truthful commission allocation and appliedAt period, missing-person totals retained. Full suite at2514043:144 files/1314 tests; fix tests7 pass and typecheck at9093eed. Raw fix evidence .artifacts/task-2-fix-tests.log. Baseline warnings remain.

Manifest source-first check: Capsule installed package and sibling Builder both3.6.48; `bun scripts/manifest-regen-check.ts` passes. Builder has pre-existing dirty package.json/package-lock.json/bun.lock/.claude paths; none touched. No regeneration or deployment performed for this check.

Checkpoint b19e798 pushed successfully to origin/fix/full-wiring-audit-20260906; pre-push generated-output gate green. This branch push is not a production deployment. Task3 repair_templates now owns pack/layout/draft-PO atomic/retry work.

React checklist applied to completed Task1/2 source and reviewed markup: new KDS per-record input uses functional state updates and accessible label; inbox draft remains controlled/editable and manual copy is event-driven; report calculations derive from current query state rather than mirrored effects. No new dependencies or design-token changes. Real browser rendering is still separate from these source/jsdom checks.

Task3 committed addd337; independent review in progress. Atomic parent mutations call generated commands with persistent client operation keys. Runtime tests 5 pass; initial full suite had 2 import guard failures, corrected with 21 focused tests and typecheck passing. Root will rerun the full gate after remaining work. Review specifically checks tenant foreign references and ambiguous retries with changed source projections.

Task3 review requested fixes: freeze pending request or whole-operation receipt for changed-template retries; validate tenant/event/demand/order associations before cached generated commands; handle storage failure independently of confirmed backend success. Fix round1 underway. Root started full check against addd337 to find integration/baseline failures early, with nondeployment build environment; log .artifacts/wiring-check-task3.log.

Early full check completed: 145 files/1320 tests pass, coverage thresholds pass, typecheck/format/secrets/integration/design guards and local build pass. Last baseline-decay gate fails root entries71 > cap70 due temporary .superpowers workspace; final scoped workspace cleanup will resolve this without changing the cap. The accidentally tracked Task2 scratch report must be preserved in durable evidence then untracked during cleanup. Existing large-bundle and test runtime warnings remain disclosed.

Task3 round2 adds typed relation validators and server-side operation receipts, including a latest-operation pointer for storage-blocked refresh recovery. This allows deliberate second copies while resolving a lost acknowledgement from persisted server results. Existing-draft vendor reuse and actual replay counts are corrected. Awaiting commit and independent scoped review; downstream tasks will reuse only the reviewed helper.

Task3 approved by independent gpt-6-astra at fab99af after three fix rounds. Final focused5files31tests/typecheck green. Atomic pack/layout/draft-PO writes, authenticated typed relationships, whole-operation receipts, blocked-storage/cleanup recovery, correct vendor reuse and actual counts verified. No findings parked. Moving to culinary clone/import/restore; no deployment.

Checkpoint01194ef pushed successfully; repair_culinary now implements Task4 from the reviewed receipt interface. Documentation comparison added to findings.md: historical seed entrypoint claim corrected, actual-yield provenance made precise, completion/push/deployment distinguished. Spec acceptance checks reflect reviewed Task1-3 and completed inventory only; policy-wide completion remains open pending remaining tasks. Spec lint passes19 specs.

Task4 initial implementation5666235/2cc55d1 passes typecheck and7files25focused tests, including real snapshot capture shape into stored-ID restore. Root identified a remaining UI contract gap before review: recovered prior operations must propagate identity/count/status rather than silently claiming current new import/restore input was saved. Author is fixing notices and preserving new reviewed input on recovery; Task4 is not yet complete.

Full test checkpoint at ec79152 passes149files1338tests. Independent review still found frozen failed payload could discard or strand corrected input. Fix round1 uses stable keys plus authoritative parent receipts with current retry input, covering both previously committed and rolled-back operations. Additional restore rollback/legacy-metadata and deleted-ingredient receipt recovery cases are required before Task4 closes.

Task4 approved at11ec7e8 by gpt-6-astra. Final focused10files49tests/typecheck pass; all six shared pending-helper consumers independently checked. Corrected failed input now succeeds under stable identity, committed prior requests recover honestly, and restore rollback/legacy defaults/deleted ingredient recovery are covered. Warning proof is helper-level plus reviewed page wiring, not a mounted browser claim. Task5 operational recovery starts next.

Checkpoint24e523e pushed with pre-push regen check green. Task5 initial f0af99a passes9 focused tests/typecheck/integration guards; additional actual stock-transaction and reactive menu-phase proofs requested before task review. Legacy coordinator tests do not prove the newly shipped stock seam.

Independent source review confirmed a release-blocking receipt privacy flaw: unrelated generated wrappers can replay global commandIdempotencyKeys before authentication. Issue281 tracks the broader generator defect. Task7 now includes private technical receipt storage and removal of redundant child cache keys; AC041 remains PENDING. No production probing, receipt migration, or deployment occurred.
