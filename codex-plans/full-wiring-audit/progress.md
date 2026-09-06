# Full wiring audit progress

2026-09-06: created isolated work branch from deployed main; read binding no-fake-data spec; launched three read-only domain audits. Existing codex-plans files belong to older tasks and remain preserved. No app code changed yet; no run or deployment started.
# 2026-09-06 implementation update

Three independent static audits completed; confirmed findings are preserved in findings.md and expanded into eight repair groups in task_plan.md. Task 1 committed as a7b5b98 with 141 files / 1303 tests and typecheck passing, awaiting independent task review. Root noted source-string tests may not prove interaction behavior; reviewer is checking that requirement before acceptance. Full app task is not complete.

Root generated-contract scan checked 335 direct calls against 591 generated docId-required hooks; three known missing-docId calls only. Adapter/reference audit is ongoing. Seed issue #113 received a source-evidence refresh: entrypoint and promoted create coverage fixed, authentication and actual reference resolution still unproven/broken by inspection. No production mutations or deploys.

Adapter audit completed: all enumerated references/dynamic arguments target docId correctly. Task 1 independent review requested honest historical queued wording/persistent unavailable guidance and actual component interaction tests; implementer is fixing both. Read-only local listener check found existing services on 3210/3211 and 7811; their checkout ownership has not yet been verified and no service was restarted or stopped.

Tasks1 and2 now independently approved by gpt-5.6-terra. Task2 commits2514043/9093eed: explicit KDS actual yield, route/vendor/revenue provenance labels, truthful commission allocation and appliedAt period, missing-person totals retained. Full suite at2514043:144 files/1314 tests; fix tests7 pass and typecheck at9093eed. Raw fix evidence .artifacts/task-2-fix-tests.log. Baseline warnings remain.

Manifest source-first check: Capsule installed package and sibling Builder both3.6.48; `bun scripts/manifest-regen-check.ts` passes. Builder has pre-existing dirty package.json/package-lock.json/bun.lock/.claude paths; none touched. No regeneration or deployment performed for this check.
