# Whole-branch code review

Reviewer: gpt-6-astra, review_final_code. Range 9eccdbc..4652173. Verdict: REJECT pending three Important findings.

1. clientOutreach.ts accepts unrelated/deleted/missing client IDs before reuse/create; generated create also does not resolve the relation. Require live same-tenant client, not an invented active-status restriction.
2. proposalPdfProjection.ts falls back to live values for absent/malformed published snapshots; ProposalsPage discards provenance. Surface nonblocking visible legacy/malformed fallback provenance.
3. ProposalCreateForm No template selection leaves hidden template sections, fee ownership and tax mode. Reset/detach template-owned configuration while retaining appropriate operator input; mounted regression required.

Minors: two new explanatory paragraphs use text-sm (13px), violating DESIGN body floor15px; mounted personal-view caller projection coverage missing; receipt helper cross-tenant exact/head proof missing (raw filter assertion is insufficient).

Design assessment: front-matter palette/type/radius match app.css; no visual-language replacement or exception additions found. New body-copy floor violations are the two above. No disproportionate approval/lifecycle policy found. Atomic recovery, partial progress and retained input reduce tedium. All four ledger rulings reasonable. Strong areas: rollback, authenticated replay, procurement overrides, bulk retry and frozen projections.

Method: supplied source diff in bounded passes plus relevant unchanged owners, requirements, ledger and DESIGN. No test reruns, mutation or production/authenticated-browser verification. Root final gates and separate evidence review remain separate boundaries; #113/#281/production receipt migration are not resolved claims.

Complete findings handed together to one fresh final-fix implementer; scoped re-review pending.
