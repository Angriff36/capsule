# SDD ledger — plan: codex-plans/full-wiring-audit/task_plan.md

Base: 9eccdbc4d2467525cc65ba07a95cf80bded522b5. Existing isolated worktree verified; task branch clean before planning.

## Preflight interface and consistency scan

| Tasks | Shared file/interface | Result |
| --- | --- | --- |
| 1 / 7 | Proposal template defaults and proposal lifecycle | Task 1 repairs targeting/copy only; Task 7 owns persisted template defaults. Preserve working reminders. |
| 2 / 5 | Kitchen batch completion versus prep task bulk completion | Different entities and pages; no shared actual-yield contract. |
| 3 / 4 / 5 | Recovery semantics | Later tasks reuse a helper only if Task 3 proves useful; no promised generic transaction interface. |
| 1 | Command/delivery tests versus copy changes | Test real command arguments and prevented external writes, not just labels. |
| 2 | Commission values/statuses | Remove invented 3% payment facts; tests target existing allocation contract. |
| 3 | Partial recovery | Spec permits atomic OR loud safe finish; confirmed writes cannot duplicate. |
| 4 | Culinary recovery | Same requirement across known partial owners, separate from template default pricing. |
| 5 | Event/bulk recovery | Current versions and stock-sync failures included; dormant route excluded with evidence. |
| 6 | Shared error handling | Error surfaced and legitimate actions retained; no new security restrictions. |
| 7 | Template persistence | Rendering/revisions included; compatibility for no-template old records required. |
| 8 | Completion evidence | Full gate plus independent review; static audit not represented as live browser proof. |

Task 1: dispatched next; base 9eccdbc.

Task 1: a7b5b98 implementation; reviewer gpt-5.6-terra needs fixes: legacy queued label implies delivery; source assertions do not execute draft-retention/no-create behavior. Fix round 1/5 dispatched to repair_delivery with both findings, focused interaction tests required.

Root contract-reference audit: audit_contract_refs found no additional missing docId in enumerated passed references/dynamic arguments; evidence persisted in findings.md. No live writes.

Task 1: fix round 1/5 (2 addressed, 0 open; commits a7b5b98..407b5c4). Reviewer gpt-5.6-terra approves persistent provider guidance, manual copy workflow and mounted component interaction tests.
Task 1: complete (commits 9eccdbc..407b5c4, review clean).
Task 2: dispatch next; base 407b5c4.

Task 7 preflight: Ruling: template tax seeds an editable fixed currency amount at creation, consistent with existing saved-tax behavior; no unused active-rate metadata — minimizes competing calculation paths and makes the basis explicit — if persistent automatic tax was intended, that later needs a governed tax-mode edit.

Preflight addition: Tasks 1/3/5 share consumers of useBulkRun; Task 5 may repair shared failure context but preserves original command failure categories and completed Task1 copy. Tasks 3/6 gained confirmed draft-PO/outreach retry defects. Root await-loop audit found shared useBulkRun loses partial counts; added to Task5 rather than duplicating page-level fixes.

Task 2: 2514043 implementation, reviewer gpt-5.6-terra needs fixes: Applied This Month filters createdAt rather than canonical appliedAt. Fix round1/5 dispatched with cross-month tests and removal of unused eventCount. Other measured-input/label repairs approved. Root documentation commit f6093c7 intervenes; root will run final full gate with raw log evidence. Baseline React/Vitest warnings recorded, not represented as pristine output.

Task 2: fix round1/5 (month basis, missing-person totals and unused output addressed; commits2514043..9093eed). Reviewer gpt-5.6-terra approves; baseline warnings nonblocking.
Task 2: complete (commits407b5c4..9093eed, review clean).
Task 3: dispatch next after documentation checkpoint.

Task 3: addd337 implemented; independent gpt-6-astra review dispatched for transaction/retry and tenant-reference risks. Runtime proofs 5 pass; full suite initially 1318 pass/2 architecture guards fail, both corrected and focused 21 pass plus typecheck. Final full gate remains required; no false all-green claim.

Task 3: fix round1/5 dispatched to repair_templates. Review found key-only changed-template replay corruption, missing event/demand/tenant validation before global generated cache replay, and storage cleanup exceptions misreporting committed success. All three require fixes and focused runtime/storage tests before downstream reuse. Root docs commit96e4a71 intervenes, not application changes.

Task 3: fix round1/5 review against5161768 addressed frozen payload; open wrong-table IDs, role replay, durable storage failure recovery. New vendor-match guard breaks existing event-draft reuse; count notice uses current template rather than replayed payload. Author amended5161768 to7561ac1 with role replay checks and27 passing focused tests/typecheck; this addition awaits next scoped review. Round2 dispatched with remaining findings and new commit-only instruction after reports.

Task 3 round2 architecture: author is using authenticated tenant/family-scoped parent completion receipts in existing technical commandIdempotencyKeys, following teamChatSend precedent, rather than adding a domain table. Root requested blocked-storage deliberate second-application and refresh cases so deterministic fallback identity does not become a permanent no-op. Technical receipt insertion remains separate from governed business writes; no raw domain updates authorized.

Task 3: round2 commitd71c8b4 plus role amendment7561ac1 in scoped re-review by review_templates. Package5161768..d71c8b4; focused5files28tests/typecheck plus separate7coordinator tests pass. Root docs checkpoint57fb563 intervenes. Do not dispatch Task4 until review findings closed.

Task 3: fix round2/5 addressed typed IDs, role-before-replay, vendor reuse and pack counts. Open getter exceptions (report contradicted committed code), fallback exact receipt shadows latest head, new procurement capability check improperly denies management override; minor PO count ignores returned frozen count. Round3 dispatched same author with exact failing sequences and getter-level exception regression. No findings parked.

Cleanup verification: git ls-files .superpowers shows BOTH task-1-report.md and task-2-report.md tracked, not just Task2. Preserve both under durable existing plan/archive root before final workspace removal. No other plan workspace may be removed.

Task 3: round3 commitfab99af in scoped re-review. Exact four source regressions reproduced RED; covering5files31tests/typecheck GREEN. Package d71c8b4..fab99af. Still no completion line until review verdict.

Task 3: fix round3/5 all findings addressed, no new breakage; reviewer gpt-6-astra approves fab99af.
Task 3: complete (commits b19e798..fab99af, review clean).
Task 4: dispatch next after documentation/push checkpoint; use reviewed parent receipts and pending helper, not older key-only design.

Task 4: repair_culinary (gpt-5.6-sol) dispatched at01194ef with task-4-brief.md; report task-4-report.md. Work-branch push01194ef completed, pre-push regen check green. No production deployment.

Task 4: Ruling: legacy snapshots without sortOrder restore positional order, and absent wasteFactor uses the established generated default; new snapshots preserve both plus prepNotes — retains restorability without claiming missing historical metadata exists — if a historical component used different uncaptured metadata, that detail cannot be reconstructed from its old snapshot.

Task 4: initial commits5666235/2cc55d1, typecheck and7files25tests pass. Second commit removed production test hook and proves rollback through actual generated rejection plus UI snapshot shape→stored snapshotId→restore. Root completion check found recovered output discarded by all UI adapters; global component-import scope could resolve an earlier receipt and clear a different newly reviewed recipe. Author completing propagation, honest identity/count notices and draft retention before independent initial review. Capture warning initially helper-only; requested mounted proof if scoped.

Task 4: follow-up ec79152 propagates recovered/actual identities and keeps new import review; final focused6files19tests plus typecheck pass. Independent gpt-6-astra review_culinary dispatched against01194ef..ec79152. Capture-warning proof remains helper-level and explicitly disclosed to reviewer. Root full test checkpoint running .artifacts/wiring-tests-task4.log.

Task4 review: Important frozen old request can first commit after rollback with recovered=false and discard corrected current review; corrected invalid input also remains permanently frozen. Minor but required coverage gaps: restore rollback from existing lines and legacy snapshot defaults; import live-reference check precedes receipt and prevents recovery after later deletion. All are being fixed, not parked. Root full checkpoint149files1338tests passes at ec79152.

Task4 Ruling: stable operation identity plus atomic whole-operation receipts are authoritative; retry payload may use the operator's current input instead of permanently freezing failed values — every one of the six beginPendingOperation consumers now has a parent receipt, so a committed earlier request replays as recovered and an uncommitted one can accept corrections atomically — if a future caller lacks a parent receipt, reusing this helper for mutable retries would be unsafe; document that precondition and test both changed-input outcomes.

Task4 fix round1/5: all findings addressed at11ec7e8; gpt-6-astra reviewer approves, including six-consumer shared-helper compatibility.10files49tests/typecheck green.
Task 4: complete (commits01194ef..11ec7e8, review clean).
Task 5: dispatch next after documentation checkpoint; use updated Task5 brief and reviewed stable-key/parent-receipt interface.

Task 5: repair_operations (gpt-5.6-sol) dispatched at24e523e; task-5-brief.md and task-5-report.md. Root branch push pending. Task4 completion patch initially missed literal WIRING-4 text, corrected after reading actual line; no source changed by failed patch.

Ruling: isolate materialization receipts in a commandless private technical Manifest table and remove redundant child cache keys from parent-receipted transactions, bundled with Task7 regeneration — independent review confirmed unrelated generated wrappers can otherwise read our deterministic receipts before auth (#281), so own-seam auth is insufficient — costs one internal table and generated artifacts, with no new operator permissions or workflow steps. The branch must not be released before this repair; no production cleanup or probing authorized/performed.

Task5 initial f0af99a:9 focused tests/typecheck/4 integration guards pass. Root requested actual stock-seam rollback/replay/relationship tests and menu reactive phase regression before initial independent review; legacy coordinator tests are not evidence for the new seam. Named source risks: readiness silently skips sync, row count is not saved-row identity, and ambiguous stock acknowledgement needs truthful replay. Original implementer resumed. Task5 is not complete.

Task7 source preflight: Capsule and Builder installed Manifest3.6.48 still match; Builder dirty package.json/package-lock.json and untracked.claude/bun.lock unchanged. Commandless favorite entity precedent rechecked. AC041 added PENDING for private receipts. Reverify pins immediately before regeneration.

Task5 strengthened fe98972 includes stock parent receipt/rollback/relationships, production menu lifecycle proof, and completed/unfinished bulk row retention. Initial independent gpt-6-astra review_operations dispatched against24e523e..fe98972. Root full test checkpoint152files1346tests passes; .artifacts/wiring-tests-task5.log. Baseline router/SSR warnings remain. No task completion until review verdict.

Task5 review rejected menu recovery atfe98972: delayed reactive rows/lost acknowledgement can duplicate creates; invisible phases have no explicit stock-only retry and misleading zero-failure counts; lifecycle does not claim in-flight attempt and stale completion can clear newer work. Fix round1/5 dispatched same author with runtime/lifecycle covering tests required. Receipt migration and authorization-before-replay remain Task7 integration checks. Work branch pushed throughfe98972, regen check green.

Task5 round1 committed747f683; runtime/lifecycle/bulk9tests and typecheck pass, integration guards pass. Menu materialization now parent-receipted and atomic, visible stock-only retry/lifecycle attempt identity added, stock replay permission check added. review_operations scoped re-review dispatched againstfe98972..747f683. No completion line yet.

Task5 fix round1/5:3 original findings addressed,2 new Important open at747f683: recovered prior menu output does not explicitly retain changed current lines; current-request demand baseline can deadlock recovered/no-new-write operation. Round2 same author must join recovered server output to authoritative readiness and retained current request, with integration regression. No findings parked.

Task5 round2 committed36be772;9focusedtests/types/3guards pass. Recovered output now retains outstanding current lines, returns demand versions, and joins real receipt result to lifecycle observed-version readiness proof. Root separately verified installed Convex mutation read-own-writes transition guarantee; report cites exact source. review_operations scoped re-review747f683..36be772 active.

Task5 fix round2/5:2 findings addressed,0 open, no new breakage; gpt-6-astra approves36be772.
Task 5: complete (commits24e523e..36be772, review clean).
Task6 dispatch next after root documentation checkpoint. Receipt privacy remains Task7/AC041, not a completed platform claim.

Task6 repair_shared(gpt-5.6-sol) dispatched at0b3bcf6 with task-6-brief/report paths. Task5 documentation checkpoint0b3bcf6 pushed, pre-push regen check green. No production deployment.

Root global contract checkpoint afterTask5:591required-docId hooks,666authoredTS/TSXfiles,326directcalls,0missingdocId;6dynamic arguments remain the previously inspected spread/coordinator adapters. Removed split stock calls now use governed authored transaction seam. .artifacts/audit-command-contracts.json refreshed; repeat afterTask7 before final claim.

Task6 repair_shared committed4c42c56,7focusedtests/types/codegen/format/secrets pass. review_shared(gpt-6-astra) dispatched against0b3bcf6..4c42c56. Root full test checkpoint154files1353tests passes, .artifacts/wiring-tests-task6.log; baseline SSR/router warnings remain. No task completion until review verdict.

Task6 review:2 Important open, round1 original author dispatched. Outreach generated query denial returns[] rather thanthrowing, so ignoredqueryresult+rawread exposesexistingtaskID; usevisiblequeryrows/governedcreate. Attachment globalpendingguard silentlydrops otherenabledrowremovals; useper-IDpending. Minors recorded: stale personal-view owner-only comment; missing mountedtwoowner projection test (serverdefaulttestexists); baseline Vitest deprecation. Author asked to correctcomment/addfocusedprojectionproof ifstraightforward; minors do notextendfixloop.

Task6 fix round1/5:2Important+stalecomment addressed atc8f1e6d, no new breakage; gpt-6-astra approves.9focusedtests/types/format/secrets pass.
Task 6: complete (commits0b3bcf6..c8f1e6d, review clean).
Task6 minor (final review): mounted personal-view projection test missing, while backendtwoowner independence is proven. Baseline Vitestdeprecation remains unrelated.
Task7 source preflight repeated: bothinstalledManifest3.6.48, Buildernonjunction, pre-existingdirtypackagefiles/untracked.claude/bun.lock untouched. Dispatch next afterdocscheckpoint.

Task7 repair_proposal_integration(gpt-5.6-sol) dispatched at a69b10b; brief/report paths task-7-brief/report.md. Own private receipt scopedcommit plus proposal persistence/rendering integration. Workbranch a69b10b pushed, regencheckgreen. No production deployment.

Task8 final review candidate: new clientOutreach.ensureOpen uses typed client ID but no live same-tenant client load; generated ClientOutreachTask_createViaOpen:3043-3084 does not enforce authored belongsTo tenant/client relation (src/sales/client-retention.manifest:26). Existing generated path also had this gap; determine scoped new-seam validation before final approval, without weakening or inventing business lifecycle policy. This was found outside Task6 fixdiff and does not reopen its scoped review. Include alongside mounted personal-view projection coverage in final reviewer inputs.

Task7 private receipt commitff40ad3 generated byownedregen; Builder predirtypaths unchanged. Actual generated indexes areby_receiptKey/by_tenantId (encodedkeycontainstenant pluslookupfilter), notcompoundindex; author asked to reportthatboundary. Proposalimplementation inprogress. Root requested supported-renderingbehaviorproofs beforeinitialreview: actualjsPDFoutput, mountedshared/signing, and publishedPDFadapterafterliveevent/venuechanges; source/typecheckalone doesnotfulfillbrief. Root docs-onlyfindingsreconciliationcommit2bff3ff intervenes; reviewbase remainsa69b10b.

Task7 implementation complete ff40ad3/fcdcd58/8ac9ad5. Report:21receipttests,15proposalflowtests,5renderer tests green plus types/guards/regen/codegen. review_proposal_integration(gpt-6-astra) dispatched a69b10b..8ac9ad5. Canonicalpackage26MB includesredundantcontent-addressedBuilderbaselinecopies; -source.diff225KB excludesonlythosecopies, retainsallauthored/generatedcode andfullstat. No semantic sourceexcluded; ownership/regen gatesverifycopies. Root fullcheck running .artifacts/wiring-check-task7.log, execsession79518, localnonVercelbuild only.

Task7 fullcheckfinished:159files1365tests/coverage/types/format/secrets/allintegration/designguards/localbuildpass; onlybaseline-decayroot71>70 fails fromprivateworkspace. proof:emitupdated3generated/proofartifacts forauthornextcommit. No deployment.

Task7 initialreviewrejected7Important: template-firsttaxzero; switchfees/taxcompoundorretainoldfee; controlleddraftrestorelost; publishedPDFuseslivewhilequeryloading; draftPDFomitsrealmenu; PDFvisibilityleaksevent/perpersonpricing; sharedtimelineomitsactualtimes. Round1 originalauthor dispatched withmountedcreationform testsrequired, existingpublicationproofretained. Minoradjacentheadingrule/orderrequested; receiptcross-tenanthelperproof minorcarriedforfinal. NoImportantfindingparked.

Task7 round1 committed19a7567,5files13tests/types/event/commercial/design/proofguards pass. Authorhonestlyreportsmountedtestsaddedafterimplementation, notpreimplementationRED; reviewfindingsprovidedreproductionevidence. All7fixes+headingrules+3generatedproofoutputs included; scopedreview8ac9ad5..19a7567 active. Receipt helpercross-tenantcoverage remainsminorforfinalreview.

Task7 fixround1/5:7originalImportant addressed;1newImportant open. Hiddenserializeddraftstate changesonrowremove butnativeinput-onlyautosave misseschanges, restoringremovedchargesafterrefresh. Round2 authorfixexplicitdynamicpersistence+actualsave/remove/remount/restoretest, protectoffereddraftfrommountoverwrite. MinornewPacific-time literaltest requestedtimezone-safe assertion. Receiptcross-tenanthelperproof remainsfinalreviewminor.

Task7 round2b595b6f reviewed: removedrowpersistencefixed;1newImportantsharedhookreturnsforofferedDraftbeforearmingexistingbeforeunloadwarning. Round3 sameauthor targetedorderingfix+warningassertion. Timefixtureminorstillassumessamelocaldate; requestedlocalDateconstruction/date-boundaryassertion. Noimportantfindingparked.

Task7 fixround3/5:unloadwarning+timezonefindings addressedatf8c7e34, no newbreakage; gpt-6-astra approves.8focusedtests/typespass.
Task 7: complete (commitsa69b10b..f8c7e34, review clean).
Task8 finalreview next. Carryminor personal-viewmountedprojection, receiptcross-tenanthelperproof, andoutreachclientrelationcandidate. No importantfindingsparked. Finalgate/cleanup/push remain.

Task8 final gpt-6-astra whole-branch review REJECT:3Important (outreach client relation, PDF fallback provenance, No template reset) and3Minor (body floor, personal-view mounted proof, receipt helper tenant proof). Complete findings sent together to fresh repair_final_wiring(gpt-5.6-sol), basecb4b3de, final-fix-brief/report.md. One final fix dispatch and scoped re-review only. Independent gpt-5.6-terra evidence review APPROVES cb4b3de correction: historical AC006/013 now PENDING for missing required J receipts, P evidence preserved. Review records saved beside ledger. No deployment.

Task8 single final fix wave fc07561: all6findings implemented;5files19tests/typecheck/design-vocab/diff-check pass. Report distinguishes genuine behaviorRED from already-correct coverage additions and initial invalid outreachfixture. review_final_code scoped re-review dispatched4652173..fc07561; no second wave. Root full clean gate/archiving/push pending.

Task8 final scoped re-review: gpt-6-astra APPROVE code/integration fc07561; all3Important and typography/personal-view proof addressed, exact receipt tenant proof valid. One Minor remains: head test seeds tenant-a:head:pack:scope but operation scope:next:storage-unavailable resolves scope:next, so it passes on key miss, not tenant isolation. No observed production leak or new code breakage.
Ruling: retain the minor recovery-head tenant-test gap as explicitly open after the single final fix/re-review wave, rather than claim that assertion proves isolation — reviewer approves production code and exact lookup proof, while the SDD final-wave limit forbids a second wave — cost if wrong: weaker regression coverage for head lookup, requiring a matching-key test correction in follow-up; no production security assurance is inferred from that assertion.
Task8 review complete with1parkedMinor; full gate/archive/push remain. Final reviewer details are final-scoped-review.md. Archive unique evidence before removing only this plan's temporary diff workspace.

Task 8: complete (commits9eccdbc..fc07561, final code/integration APPROVE,1parkedMinor documented above). Clean full check161files1376tests/allgates exit0; regen/spec19/contractscan green; sourcefc07561 pushed. Archived unique plan/reports/briefs/ledger before deleting only own scratchdiffs/emptyparents; no cap weakened. No deployment. Final documentation checkpoint follows, without source changes.
