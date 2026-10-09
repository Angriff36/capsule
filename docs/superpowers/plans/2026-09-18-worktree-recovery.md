# Capsule Worktree Recovery and Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Preserve every user-owned change, reconcile the valuable My Day and Event Workbook work, and make the remaining worktrees understandable and safely disposable only when proven redundant.

**Architecture:** Separate Git topology, committed product behavior, and dirty working-tree content. Capture dirty content outside the repository first, reconcile source in an isolated branch, classify older loop work by current source behavior, then archive only clean redundant worktrees.

**Tech Stack:** Git worktrees, PowerShell, Vite + React, Manifest Builder, Convex, Vitest, and Capsule's existing bun run check gate.

**Spec:** C:\projects\capsule\AGENTS.md plus the 2026-09-18 audit evidence: active HEAD 787e145b, main and origin/main 2adc32ea, and 29 registered worktrees.

## Global Constraints

- Preserve every dirty and untracked file. Do not reset, stash, overwrite, prune, or force-remove it.
- Do not push main or deploy during this recovery.
- Do not infer feature integration from ancestry alone; verify current source behavior and wiring.
- Read DESIGN.md before authored UI changes. Amend it only with explicit owner approval.
- Never hand-edit generated Convex, Manifest, proof, or Builder output.
- Do not add tests unless the owner explicitly asks; run existing gates.
- Any UI or product diff requires independent non-authoring review.

## File and Artifact Map

- External recovery bundle: C:\projects\capsule-recovery-2026-09-18\
- Reconciliation checkout: C:\projects\capsule-reconcile-2026-09-18\
- Disposition ledger: docs/operations/worktree-recovery-2026-09-18.md
- Possible My Day source files: src/features/staff/MyDayFrame.tsx, src/features/staff/MyDayPage.tsx, src/features/staff/my-day.css
- Generated proof and Builder files remain outputs and are regenerated, never hand-edited.

---

### Task 1: Capture every worktree before cleanup

**Files:** Create only under C:\projects\capsule-recovery-2026-09-18\.

**Produces:** A restorable snapshot of all 29 worktrees, including dirty and untracked content.

- [ ] Create the external recovery directory.
- [ ] Save git worktree list --porcelain, git show-ref, and git ls-remote origin.
- [ ] For each worktree, save HEAD, branch, git status --short, unstaged git diff --binary, and staged git diff --cached --binary.
- [ ] Copy every untracked file with its worktree-relative path. This must include the My Day untracked files and codex-review-prompt.txt.
- [ ] Hash every captured patch and copied file with SHA-256.
- [ ] Compare the status paths to the capture manifest. Stop on any mismatch.

### Task 2: Create an isolated reconciliation branch

**Files:** Create worktree C:\projects\capsule-reconcile-2026-09-18 and branch recovery/worktree-reconciliation-20260918.

**Produces:** A clean checkout based on current HEAD 787e145b; the dirty root and evidence worktrees remain untouched.

- [ ] Read AGENTS.md, DESIGN.md, docs/reference/manifest-llms-full.txt, and applicable testing and architecture docs.
- [ ] Run git worktree add -b recovery/worktree-reconciliation-20260918 C:\projects\capsule-reconcile-2026-09-18 787e145b.
- [ ] Verify the new checkout is clean and its HEAD is 787e145b.

### Task 3: Reconcile My Day deliberately

**Files:** Inspect the My Day source, DESIGN.md, and the captured capsule-my-day-verify patch. Modify only approved source files in the reconciliation checkout.

**Produces:** A reviewed My Day reconciliation commit, or a documented decision to preserve the dirty variant without integrating it.

- [ ] Three-way compare base d04d5ec0, current 787e145b, and the dirty My Day files.
- [ ] Treat MyDayDashboard.tsx as matching current content; separately inspect MyDayFrame.tsx, MyDayPage.tsx, my-day.css, DESIGN.md, and proof outputs.
- [ ] Compare visual changes against DESIGN.md. Stop if the desired result requires a new visual language or an unapproved contract amendment.
- [ ] Apply only approved source changes; regenerate generated output through the approved repository command.
- [ ] Run git diff --check, bun run typecheck, and bun run build.
- [ ] Commit the approved source reconciliation separately from other work.

### Task 4: Reconcile Event Workbook review variants

**Files:** Inspect current Event Workbook source and staged changes in capsule-event-workbook-review, -2, and -3.

**Produces:** A per-file decision: already current, superseded, or approved to integrate.

- [ ] Split each staged diff into authored source, documentation/design, and generated Builder output.
- [ ] Compare authored behavior against current commits 116f854c, 6fa0c9c8, 599298fc, and 787e145b.
- [ ] Do not replace current source merely because an older review copy differs.
- [ ] If a Manifest source changes, run bun run manifest:regen; never copy generated output by hand.
- [ ] Run git diff --check, bun run typecheck, and bun run build.
- [ ] Commit approved Event Workbook source changes separately from My Day.

### Task 5: Write the 29-worktree disposition ledger

**Files:** Create docs/operations/worktree-recovery-2026-09-18.md.

**Produces:** A source-backed table containing path, HEAD, purpose, dirty paths, current-source evidence, and disposition for every worktree.

- [ ] Mark Actions checkout v7, OD056 saved-report ownership, issue35 PrepTask identity, and S7 packlist access as superseded/integrated, citing their later current commits.
- [ ] Mark S2 client balances, both S6 attendance-count worktrees, OD055 payment-default exclusivity, and both S5 ingredient-total worktrees as unintegrated/preserved, citing the absent current behavior.
- [ ] Mark issue32 as a generated/wiring diagnostic.
- [ ] Mark dep128 as stale React 19, and dep129/dep131 as already-superseded dependency snapshots.
- [ ] Keep every unintegrated attempt in place; do not merge or delete it as part of classification.
- [ ] Commit the ledger in the reconciliation branch.

### Task 6: Remove only proven-redundant clean snapshots

**Files:** Git refs and worktree registrations only.

**Produces:** Fewer redundant checkouts without losing a commit or dirty file.

- [ ] Recheck each candidate immediately before removal. Its status must be empty, its HEAD must be in the ledger, and its commit must be preserved by an existing branch or a local archive/recovery/worktree-name ref.
- [ ] Leave the root, My Day verify, operations-authenticated, all three Event Workbook reviews, Ralph, and every dirty loop worktree mounted.
- [ ] Remove only exact clean paths approved by the ledger, without --force.
- [ ] Verify the post-removal worktree list and refs against the recovery bundle.
- [ ] Do not run git worktree prune as a substitute for the review.

### Task 7: Verify and obtain independent review

**Files:** No new test files.

- [ ] Run bun run check in the reconciliation branch. Do not weaken or delete failing checks.
- [ ] Recheck git status --short --branch, git worktree list --porcelain, git worktree prune --dry-run --verbose, and git rev-parse main origin/main.
- [ ] Obtain an independent non-authoring model review of the actual diff, the disposition ledger, and DESIGN.md. The review must explicitly check that no new guardrail creates unnecessary catering-user tedium.
- [ ] Hand off without pushing main, deploying Convex, deploying Vercel, or removing dirty worktrees.

## Completion Criteria

- Every dirty and untracked path is captured outside the repository before cleanup.
- My Day and Event Workbook changes are reconciled only through reviewed source diffs.
- The ledger accounts for all 29 original worktrees.
- The four genuinely unintegrated feature families remain preserved and explicitly labeled.
- Only clean, proven-redundant worktrees are removed, without --force.
- bun run check passes on the reconciliation branch.
- An independent reviewer approves the final source diff, including the UI/design review.
