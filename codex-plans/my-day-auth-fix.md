# My Day account identity correction

User request: repair the redundant/broken staff-name picker on already authenticated `/my`, while the recipe Ralph loop continues untouched.

Isolated worktree: C:\projects\capsule-my-day-auth, branch fix/my-day-auth, baseline cf23268. No recipe-loop files, credentials, provider settings or live records changed.

Root cause: My Day independently resolves a staff identity using browser storage and fuzzy Clerk-name matching. Choosing a displayed person does not establish an account link and can immediately be rejected. AuthGate's workspace bootstrap also admits an org member without invoking its membership-only verified-email link attempt.

Fix: use existing server authStatus.personId with tenant/subject/active-row consistency; remove the local picker and nickname veto from the page; attempt the existing server-verified email linking action when a staff association is absent; preserve full-app access and show specific retry/recovery outcomes. No client-supplied role/tenant changes or guessed person binding.

Required proof: mounted route with differing account/staff names, account switch, ignored browser picks, tenant/subject mismatch rejection, missing-match explanation, provider retry and full repository checks. Prior legacy resolver behavior tests remain intact; obsolete source-text expectations for the removed picker now check its absence and canonical resolver use.

Updated owner contract: sign in once, automatically open the Capsule profile, and use the same identity across every screen. Imported staff are not selectable identities or a second login. No staff-name confirmation is required. Deployment remains separate from this source fix.

Account bootstrap extends the initial correction: the shared AuthGate waits for the signed-in account's canonical profile. Authorized workspace members receive a Person-backed account profile automatically from provider details and trusted session permissions. Existing saved identities remain unchanged. Imported records do not participate in legacy email self-linking. authStatus supplies the own-profile projection directly to My Day and chat, independent of roster pagination. No imported assignments/payroll are moved, and no identity-provider accounts/passwords are created.

Backend scratch verification (`.artifacts/verify-account-bootstrap.ts`, convex-test) passed anonymous denial, simultaneous/repeated setup idempotency, imported-row preservation and exclusion, trusted role preservation, account isolation, and inactive-account recreation denial. Expanded local gate and independent GLM review are recorded separately below when complete.

Expanded GLM review initially rejected the unchecked IdP role cast and conflict with Person's unique tenant/email declaration. Corrected known-role mapping with safe staff fallback, removed email-as-identity uniqueness at the Manifest source and regenerated, excluded imported null defaults from account-revocation checks, and matched chat's active-profile check and touch-target sizing. The suggested imported-email login denial was not used because it conflicts with the owner's explicit no-linking flow. Scratch runtime checks additionally pass Clerk member/custom-role setup and the public first-use/repeat-use action.

Tracked production symptom: https://github.com/Angriff36/capsule/issues/282.

Independent review found a related existing global offline queue/cache boundary. Corrected it by scoping both to subject/tenant/person, withholding replay until canonical identity resolves, and cancelling subsequent replay writes on account change. Legacy unowned queues are retained with an explicit confirmed-discard action; no real user's local data was deleted by this development task. Focused regressions demonstrated the original cross-scope replay and mid-drain failure before correction.

The Codex review agent exhausted its allowance before final approval. No approval is claimed from it. A bounded independent GLM review is being run through the existing GLM profile; no additional Codex agent was started. Final checks and review evidence are in .artifacts/auth-focused.log, auth-full-check.log and auth-glm-review.txt.

Final local check completed successfully on 2026-09-06: 162 files / 1,385 tests, typecheck, format, secret scan, ownership/integration checks, local Vite build and baseline decay. Focused auth coverage: 32 tests. GLM CLI diagnostic confirms model glm-5.3[1m]; final verdict is still pending at the initial fix commit. The CLI session hook modified CLAUDE.md; that unrelated hook output is excluded from this fix.

Final independent review: GLM-5.3 APPROVE, 2026-09-06, after reviewing the complete source/diff and DESIGN.md. It accepted canonical identity, scoped queue/cache behavior, account-change cancellation, explicit legacy discard, tests and usability. Code commit 30036258 is pushed to origin/fix/my-day-auth; pre-push regeneration check passed.

Review follow-up: GLM flagged cold offline reload while authStatus is unavailable. Source verification shows this already blocks in the unchanged outer AuthGate/ClaimGate (src/app/App.tsx:580-588, src/app/AuthGate.tsx:61-69), which queries the same endpoint as useAuthStatus. Therefore it is not a newly introduced page regression. Track cold-start qualification separately; do not bypass authorization using a browser-selected identity. Minor retained observations: acknowledgement-storage failures can show a generic retry error; old unscoped cache bytes remain on-device and are not read by the new scoped path. No live production verification or account repair is claimed.
