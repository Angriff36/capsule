# My Day account identity correction

User request: repair the redundant/broken staff-name picker on already authenticated `/my`, while the recipe Ralph loop continues untouched.

Isolated worktree: C:\projects\capsule-my-day-auth, branch fix/my-day-auth, baseline cf23268. No recipe-loop files, credentials, provider settings or live records changed.

Root cause: My Day independently resolves a staff identity using browser storage and fuzzy Clerk-name matching. Choosing a displayed person does not establish an account link and can immediately be rejected. AuthGate's workspace bootstrap also admits an org member without invoking its membership-only verified-email link attempt.

Fix: use existing server authStatus.personId with tenant/subject/active-row consistency; remove the local picker and nickname veto from the page; attempt the existing server-verified email linking action when a staff association is absent; preserve full-app access and show specific retry/recovery outcomes. No client-supplied role/tenant changes or guessed person binding.

Required proof: mounted route with differing account/staff names, account switch, ignored browser picks, tenant/subject mismatch rejection, missing-match explanation, provider retry and full repository checks. Prior legacy resolver behavior tests remain intact; obsolete source-text expectations for the removed picker now check its absence and canonical resolver use.

Live boundary: asked the owner whether the displayed Ryan profile is the intended staff identity. Until confirmed, no production mapping repair is authorized or claimed. Correcting the UI cannot prove an existing wrong persisted link is correct. Deployment remains separate from this source fix.

Tracked production symptom: https://github.com/Angriff36/capsule/issues/282.

Independent review found a related existing global offline queue/cache boundary. Corrected it by scoping both to subject/tenant/person, withholding replay until canonical identity resolves, and cancelling subsequent replay writes on account change. Legacy unowned queues are retained with an explicit confirmed-discard action; no real user's local data was deleted by this development task. Focused regressions demonstrated the original cross-scope replay and mid-drain failure before correction.

The Codex review agent exhausted its allowance before final approval. No approval is claimed from it. A bounded independent GLM review is being run through the existing GLM profile; no additional Codex agent was started. Final checks and review evidence are in .artifacts/auth-focused.log, auth-full-check.log and auth-glm-review.txt.

Final local check completed successfully on 2026-09-06: 162 files / 1,385 tests, typecheck, format, secret scan, ownership/integration checks, local Vite build and baseline decay. Focused auth coverage: 32 tests. GLM CLI diagnostic confirms model glm-5.3[1m]; final verdict is still pending at the initial fix commit. The CLI session hook modified CLAUDE.md; that unrelated hook output is excluded from this fix.
