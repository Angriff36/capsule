# Fixes Log

> Archived after implementation and verification handoff on 2026-07-16.

## 2026-07-16

- Issue: The first combined planning-template inspection failed because `codex-plans` and an ignore match were absent.
  Fix: Read each required template separately and initialized the four planning files with `apply_patch`.
  Commands: `Get-Content ...templates\\*.md`; `apply_patch`

# 2026-07-16

## Generated mutation search returned no matches

- Attempted to locate culinary creation exports using generic command names in `convex/mutations.ts`.
- The generated exports use entity-qualified names, so the pipeline produced no output and exited 1.
- Next attempt will search exact generated symbol names and inspect their definitions directly.

## Generated bindings filename mismatch

- A follow-up search found the generated mutation bodies but also referenced the nonexistent `src/generated/manifest-bindings.ts`.
- The actual generated client contract is `src/generated/manifest-wiring-bindings.ts`; subsequent inspection will use that path.

## Combined CSS/icon inspection exited 1

- The CSS portion succeeded and confirmed the committed Component Book/document classes.
- The icon search targeted an incorrect filename/pattern and returned no matches, causing the combined command to exit 1.
- Kitchen will use text/typographic affordances and existing known icons only where already imported elsewhere; no icon dependency is required.

## Repository typecheck baseline failures

- `bun run typecheck` currently fails in untouched generated files (`convex/mutations.ts`, `src/lib/manifest-convex-react.ts`) and the untouched Event guest panel.
- No error points to a Culinary file. Per ownership rules, generated files and unrelated Event code will not be edited as part of this slice.
- The full gate is expected to remain blocked at this pre-existing typecheck baseline unless the user's dirty dependency/tooling state resolves it.

## Vite background launch failed with Bun shim

- `Start-Process -FilePath bun` failed because the resolved Bun command is a shell shim rather than a directly executable Win32 application.
- Retry will resolve the real Bun executable path before launching it hidden, preserving the in-app browser verification flow.

## In-app browser backend unavailable

- Browser runtime setup completed, but the required in-app browser backend (`iab`) was unavailable.
- Per the browser verification guidance, inspect backend discovery once and do not switch to an unrelated automation backend as a workaround.

## Parallel remaining-gate run short-circuited

- Running format, secrets, coverage, and baseline-decay together returned only the baseline-decay failure because one rejected command short-circuited the aggregate result.
- The reported baseline failure is the pre-existing root-entry count (`41` versus cap `38`).
- Rerun the other stages individually so each result is captured; do not delete unrelated root files to satisfy the cap.

## Unrelated staged regeneration state appeared

- Final status inspection shows a large staged change set across generated Convex/schema/wiring files and staged deletion of the existing Event creation seam/adapter.
- These changes were not made for the Kitchen slice and were absent from the initial dirty-worktree inventory available to this task.
- Do not revert, restage, commit, or repair them. Restrict remaining work to read-only attribution and Kitchen-specific verification.

## Touched-file format check now sees external package drift

- Every Kitchen-authored file passes Prettier except `package.json`, which changed again after this task formatted it and now contains overlapping staged/unstaged external edits.
- Do not run a whole-file formatter over the user's overlapping package changes. Verify the Culinary script lines structurally and report the repository formatting blocker separately.

## Baseline root cap after plan archival

- The first baseline run counted 41 root entries while the temporary `codex-plans` directory existed.
- After archiving those files and removing that directory, the count fell to 40 but remains above the configured cap of 38.
- No unrelated root files were removed.

## Generated creation surface arrived during verification

- A concurrent regenerated change set added governed `useCreate*` hooks and `createVia*` mutations, making the task's temporary authored Culinary allocation seam obsolete.
- Focused tests were tightened first and failed on the adapter/seam exemption as expected.
- The Kitchen UI was switched to generated creation hooks, the authored seam and adapter were deleted, and the guard now rejects any local Culinary allocation seam.

## Final repository gate blocker

- The final `bun run check` passes toolchain, Event/Culinary guards, typecheck, format, secrets, all 262 tests with coverage, and production build.
- It fails only at `baseline:decay`: 40 root entries exceed the configured cap of 38.
- No unrelated root files or baseline configuration were changed to force the gate green.
