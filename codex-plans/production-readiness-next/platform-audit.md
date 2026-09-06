# PR12-14 platform and qualification audit

Source baseline cf23268 (C:/projects/capsule-release-20260905). Source-level audit, no fresh live calls or tests in this planning pass. Verified below means the explicitly named prior evidence only, not complete product qualification. Paths are relative to this absolute checkout root.

## Criterion coverage

| Criterion | State | Current implementation/evidence | Remaining work |
| --- | --- | --- | --- |
| PR12-01 | partial | src/main.tsx:30 startup findings; scripts/check-deployment-config.ts and tests/deployment-config-check.test.ts; deployment cf23268 had0blockers with approved dev-auth warning | Full callback/audience/issuer matrix and authenticated production validation; keep approved allowance |
| PR12-02 | partial | convex/authProvision.ts:107 checks manager/tenant; :148 calls setPassword before :151 conflicting subject link validation | Validate/reserve target identity before external credential changes; cover conflicts and uncertain provider success (#249 pointer) |
| PR12-03 | implemented-unverified | convex/lib/authContext.ts:82 person-first tenant/role and convex/authLink.ts:51 verified-email self-link; tests/person-auth-pick.test.ts | Mounted plus authenticated person-only/org onboarding and branding proof; no new org-only restriction |
| PR12-04 | partial | Generated policy wrappers plus authored auth context; private receipt table/replay proof shipped | Cross-entry-point matrix; global pre-auth generated idempotency defect #281 remains; do not substitute a second auth layer |
| PR12-05 | partial | convex/fileStorage.ts:91 live tenant references and :130 URL resolver; tests/proofs/file-storage-ownership.runtime.test.ts | Parent read-role authorization, chat-private files through generic resolver, upload association/discard ownership, share revocation; existing tenant URL fix is not missing |
| PR12-06 | partial | Proposal snapshot/public renderers and signing runtime proofs shipped; convex/lib/proposalRevision.ts, shareLinks/signatureAcceptance owners | Negative tests for public quote/payment/share expiry/revocation and every attachment path; no blanket public-route certification |
| PR12-07 | partial | Person-first auth rereads role; convex/teamChatPush.ts:129 active account and :135 account-level preference gate delivery across devices | Prove disabled linked person cannot regain access through IdP fallback, role/session revocation, multi-device opt-out under queued jobs |
| PR12-08 | partial | check-secrets.ts, deployment redaction, encryption helpers and restricted public projections | Review generated audit/event payloads, bundle/log surfaces, errors and all external callbacks; no full sensitive-data audit evidence |
| PR12-09 | partial | convex/personalDataExport.ts:9 admin authority and :132 scoped subject package | Retention/hold-aware deletion preview and audit, complete export traversal; owner chooses destructive schedule/holds first |
| PR12-10 | partial | Event auth, file ownership, receipt privacy and person-pick focused tests exist | Complete two-tenant/role/revocation/storage/public matrix; correct known head-lookup fixture gap; no hostile production tests |
| PR13-01 | implemented-unverified | ralph-sync.sh:3 fetches configured base; :12 compares ancestry; loop.sh:259 invokes it | Isolated clean-behind/diverged/resume tests and visible source/SHA receipt beyond console |
| PR13-02 | partial | ralph-sync.sh:20 auto-merges clean tree; dirty/conflict goes to agent prompt with preservation instruction | Prove dirty/untracked/conflicted outcomes and no unrelated inclusion; prompting an agent is not proof all merges recover |
| PR13-03 | partial | ralph-preview.ps1 checks served source-map checkout, free-port startup and PID; ralph-sync.sh:65 requires preview check | Include actual source SHA and backend ownership; existing server check doesn't report owning process; exercise stale-server cases |
| PR13-04 | partial | loop.sh:327 check_done plus upstream/preview gate; deployed release distinguished in recent reports | Version/hash specs into completion receipt; invalidate old all-complete contracts on changed requirements; machine-readable separate states |
| PR13-05 | verified (release cf23268 only) | scripts/release.sh applied approved merge/full check/main push/archive; .artifacts/wiring-production-release-verification.md | Preserve release workflow; broader upstream/error fixtures remain qualification work, not a new release engine |
| PR13-06 | partial | scripts/release-receipt.ts and tests/release-receipt.test.ts; manual Vercel API/build-log SHA verification succeeded last turn | Fix CLI metadata/missing-auth classification and poll intended new SHA rather than old READY alias (#280); authenticated workflow receipt still required |
| PR13-07 | partial | Manifest3.6.48 pins agree locally; owned regen and pre-push passed | Reproduce supported Windows/CI without mutable sibling Builder dependence; existing #113/#171/#261 pointers are not current failures by themselves |
| PR13-08 | partial | QBO reconciliation retries and import checkpoints; operation receipts for audited transactional flows | Per-domain leases/cancel/dead-letter/queue-age/fairness evidence; browser lifetime and external-effect ambiguity remain domain-specific |
| PR13-09 | missing (repo evidence) | No scheduled DB+asset backup/restore-drill implementation or result found in scripts/.github/docs/operations search | Backup manifest, encrypted storage, isolated relational+asset+auth restore proof; retention/RPO/RTO and external configuration require owner choices; provider dashboard state unqueried |
| PR13-10 | partial | Runtime provider status and release inspection exist; prior deployment had a brief clean error scan | Persistent health alerts, recipients, job/connection health and rollback-versus-external-effects runbook; don't claim monitoring from one query |
| PR13-11 | partial | src/main.tsx:56 automatic lazy-chunk reload; public/sw.js install/cache/update behavior; form-draft recovery exists | Prove stale asset recovery preserves unsaved edits, guard storage failure and identify served version; no automatic reload data-loss assumption accepted |
| PR14-01 | partial | This criterion ledger plus archived audit and AC contract identify source/evidence/gaps | Execution must bind every criterion to accepted tests/live receipt/environment/SHA; planning classification is not a passing AC |
| PR14-02 | partial | Native booking, event operational transactions and billing/workforce tests exist independently | One same-event client-to-management role journey, correction, payment and report reconciliation |
| PR14-03 | partial | R2 import record/source UI and normal catalogs exist | Representative imported event with normalized recipes, purchasing and financial references through normal screens; no private-data fixture commits |
| PR14-04 | partial | Shipped-route source audit and focused jsdom/error tests from wiring release | Every route family exercised populated/empty/loading/denied/validation/conflict/error in browser |
| PR14-05 | partial | Virtualization/focus work and DESIGN authority exist | Recorded360px/desktop keyboard/screen-reader/reduced-motion role flows at current SHA |
| PR14-06 | missing (scale proof) | Virtualized client rendering is not server pagination or workload measurement | Synthetic10000events/5000dishes,100samples, cold/hot/export/import split, proposedp95<1s andinteraction<200ms; agree hardware/targets |
| PR14-07 | partial | Atomic/replay, edited-input and dynamic-draft tests in wiring audit | Cross-workflow concurrent/offline/auth-expiry/refresh/lost-response matrix, authenticated browser proof |
| PR14-08 | partial | convex/cutover.ts:132 persisted readiness/approval/rollback-plan gate, source unresolved counts | Full archive/stock/financial/provider/backup/role rehearsal and no historical side effects; current gate is not full reconciliation |
| PR14-09 | partial | Specs and audit identify missing configuration/data/definitions independently | Cohesive qualification report with blocked required workflows, no unconditional readiness claim |
| PR14-10 | partial | Release receipt and CutoverPage exist | Concise full-product receipt joining scenario/reconciliation/recovery contact; cutover remains separately authorized |

## Docs versus implementation examples

- **File access**
  - Docs claim: PR12-05 requires tenant and authorized-parent file access, not merely a storage ID.
    - Real-world example (Docs claim): a staff member cannot open a private conversation attachment just by knowing its ID.
  - Implementation: C:/projects/capsule-release-20260905/convex/fileStorage.ts:91 checks live tenant references, including attachments of any parent type; normal image URL tenant protection exists, but parent-specific read authority is not established by this helper.
    - Real-world example (Implementation): cross-tenant reference-only access is covered, while same-tenant private-parent access still needs focused verification/repair.
- **Release automation**
  - Docs claim: PR13-06 demands exact deployed SHA, backend and authenticated workflow in one receipt.
    - Real-world example (Docs claim): one receipt proves the new release, not yesterday's READY deployment.
  - Implementation: C:/projects/capsule-release-20260905/scripts/release-receipt.ts:140 reads CLI metadata omitted by the installed CLI and stops waiting on an old READY alias; separate API evidence provedcf23268 live last turn.
    - Real-world example (Implementation): deployment succeeded, but automated receipt remains partial and requires manual evidence gathering.
- **Full-product readiness**
  - Docs claim: PR14-02/06 require coherent role journeys and measured large workloads.
    - Real-world example (Docs claim): the same event goes from client acceptance to fulfilled prep and reconciled money at realistic scale.
  - Implementation: C:/projects/capsule-release-20260905/docs/task-plans/2026-09-06-full-wiring-audit/evidence/final-verification.md records1376passing focused/runtime tests, not that journey or scale benchmark.
    - Real-world example (Implementation): individually tested operations do not yet prove the entire catering day.

## Delivery boundaries

1. Identity/file safety is a parallel prerequisite before expanding credential/file external effects; don't impose unrelated new routine-operation gates.
2. Repair existing release receipt, spec freshness and preview identity rather than create a competing deployment framework.
3. Add qualification alongside each visible workflow; complete same-event journeys and scale/restore evidence at the end.
4. Provider account/retention/financial choices block their activation, not safe isolated development. No destructive schedule or provider write is authorized by this plan.
