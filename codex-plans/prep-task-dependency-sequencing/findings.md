# Findings: Prep task dependency sequencing

## Repository state

- Branch is `main` in `C:\Projects\capsule`.
- The checkout already contains a very large authored/generated delta and many untracked feature files.
- `src/features/production/KitchenDisplayPage.tsx` and its CSS are pre-existing untracked files, so their current contents must be attributed to the user until this task's edits are isolated.
- Multiple long-running Convex processes exist, but no live Codex/Claude process targeting this checkout appeared in the process check.
- Prior memory warns that generated-file timestamp churn or disappearing files is a hard stop signal in this shared checkout.

## Binding rules

- `src/**/*.manifest` is authored; generated Convex/client/schema/wiring/diagram outputs must not be hand-edited.
- `bun run manifest:regen` is the only allowed regeneration command.
- Before adding a guard, enforce only real harm. Starting dependent prep work too early is the explicit feature requirement and a proportionate gate.
- Permanent test expansion is forbidden unless requested. The requested Playwright spec must be temporary and removed after verification.

## Relevant prior evidence

- PrepTask runtime behavior is generated from Manifest commands; handwritten UI must not reproduce lifecycle policy.
- Earlier work proved `PrepTask_createViaOpen` and generated PrepTask mutation paths can have relation-hydration concerns, so generated runtime behavior must be verified rather than inferred from source alone.

## Live code trace

- `src/production/task.manifest` defines the PrepTask entity and `start` command.
- `src/features/production/PrepBoardPage.tsx` lists tasks and invokes `usePrepTaskStart`.
- `src/features/production/KitchenDisplayPage.tsx` is already routed from `src/app/App.tsx`, lists the same tasks, and invokes `usePrepTaskStart`.
- Generated queries currently expose one PrepTask list plus indexes for event, event dish, dish task, dish, ingredient, demand, recipe, and assignee. No predecessor relationship exists yet.
- The feature requires authoritative command rejection as well as disabled UI actions; disabling only buttons would leave generated command/API callers able to bypass sequencing.
- PrepTask `start` currently permits a claimed, assigned, non-deleted task and has no cross-task condition.
- Manifest's Convex projection supports `count_of` guards over a directly hydratable `hasMany` relation. The repository already uses this in `InventoryItem.release` and Event execution readiness.
- A normalized dependency edge is a better fit than an ID array: a `PrepTaskDependency` row can belong to both successor and predecessor tasks, while PrepTask can count unresolved incoming dependency edges at command time.
- The KDS maps PrepTask rows into a shared `BoardItem`; dependency metadata must be retained on task items so only the task `Start` bump is disabled. Claim and complete behavior should remain unchanged.
- Prep Board currently offers lifecycle actions per row and in bulk. Dependency enforcement must remove blocked tasks from bulk-start eligibility as well as disable each row's Start action.
- The existing task creation form is the clearest place to declare predecessors; it already has access to all active PrepTask rows and can restrict candidates to the selected event/event dish context as appropriate.
- Manifest supports `hasMany ... through ...` and `count_of` hydration. The remaining modeling question is disambiguating the two self-referential PrepTask ends of the dependency join so the generated start guard reads the successor's incoming edges.
- Local Manifest tests prove nested hasMany-to-belongsTo hydration exists for aggregate expressions, so `count_of(self.dependencies, (link) => link.predecessor.status != "completed")` is conceptually supported if the incoming dependency relation can be mapped unambiguously.
- The through-join compiler validation only requires join-side relations to source and target; a self-to-self through relation may pass validation while still selecting the wrong edge. This must be checked in generated code before adopting it.
- Convex aggregate hydration resolves a direct `hasMany` inverse by selecting the first belongsTo/ref on the child entity whose target matches the parent. Therefore a direct `incomingDependencies: PrepTaskDependency` relation is viable only if `dependentTask` is declared before `predecessorTask` on the edge entity; generated output must confirm it indexes `dependentTaskId`.
- Nested hydration resolves the lambda's named `predecessorTask` belongsTo relation explicitly, so the start guard can compare each predecessor's live status to `completed`.
- A create-time predecessor picker avoids cycle creation because the dependent PrepTask does not exist until submission. It also satisfies the requested declaration workflow without inventing a broad dependency-editing subsystem.
- Governed create hooks return `{ docId }`, so Prep Board can create the PrepTask first and then create one dependency edge per selected predecessor in the same submitted workflow.
- The dependency edge should be immutable for this slice: declare it at task creation, avoid a speculative editing subsystem, and keep lifecycle authority in generated Manifest commands.
- The generated command hydrator plans aggregate relations from the full command check set, so a named constraint can carry a human-readable rejection while still using the nested dependency count.
- `CommandFailure` classifies messages containing “must be” as validation and shows their actual detail. A constraint message such as “All predecessor prep tasks must be complete before this task can start” will therefore remain useful even outside the button-disabled UI.
- The approved repo gate is `bun run check`; Playwright is not a project dependency and no root Playwright config exists. The temporary browser verification must use Bun-compatible invocation and must not disturb other temporary artifacts already under `output/playwright/`.
- The current production files were last changed before this task and stayed stable during discovery; no active implementation writer was detected. `task.manifest` is clean, while Prep Board/KDS contain pre-existing user-owned changes that this feature must extend surgically.
- Constraints are included in `commandChecks`, so the predecessor-completion constraint will be hydrated and rendered with its declared message.

## Generated proof

- `bun run manifest:regen` completed without conflicts or assembly blockers.
- Generated schema created `prepTaskDependencies` with both `by_dependentTaskId` and `by_predecessorTaskId` indexes.
- Generated `PrepTask.start` loads incoming edges through `by_dependentTaskId`, then hydrates each edge's `predecessorTask` from `predecessorTaskId`.
- The generated start mutation rejects when any hydrated predecessor status is not `completed`, using the declared human-readable message.
- Generated client hooks include `useListPrepTaskDependency` and `useCreatePrepTaskDependency`; no generated file was hand-edited.

## Generator limitation and source-level resolution

- `bun run typecheck` proved nested relation hydration emits a lambda parameter typed as `Doc<"prepTaskDependencies">`, then reads the runtime-only `predecessorTask` property. TypeScript correctly rejects that generated access.
- The fix remains Manifest-owned: persist `isSatisfied` on each dependency edge, initialize it from the predecessor's status at declaration, and fan out `PrepTaskCompleted` to an edge command that marks matching dependencies satisfied.
- PrepTask start can then use supported one-hop `count_of` over `dependency.isSatisfied`, preserving authoritative enforcement without handwritten generated edits or app-local command policy.
- The regenerated source-level resolution is correct: declaration sets `isSatisfied` from live predecessor status, PrepTask completion fans out by `by_predecessorTaskId`, `satisfy` patches each matching edge, and start counts unresolved edge flags through `by_dependentTaskId`.
- Existing production Manifest integration guard passes.
- The Playwright prerequisite (`npx`) is installed, and the known app route `http://localhost:7811/kitchen/prep` responds with HTTP 200. Project commands remain Bun-based for execution.
- No reusable Playwright storage state or Clerk/Convex browser credentials were found in the repository environment. Existing `.playwright-mcp` artifacts are logs/snapshots only, so authenticated live-route verification may need the repository's established temporary harness pattern.
- The repository already has Playwright 1.61.1 and `@playwright/test` installed. A temporary Vite harness can mount the real Prep Board and KDS components with only the generated data hooks aliased to deterministic fixtures, avoiding authentication and durable-data changes while testing the actual rendered action logic.
- The temporary Playwright test passed all four browser assertions: blocked Prep Board, blocked KDS, unlocked Prep Board after completion, and unlocked KDS after completion.
- Generator defect tracking: https://github.com/Angriff36/capsule/issues/72.
- Full gate baseline blocker: `bun run check` passed toolchain, ownership, proof emission/validation, registry pin, then stopped at `check:event-manifest` on pre-existing Event `CommandFailure`, allergen briefing, incident panel, and timeline panel changes. The failure does not cite this feature's production files.
- Final authority review found that generated commands are callable outside the UI. `PrepTaskDependency.satisfy` therefore also needs live predecessor guards; relying only on the completion reaction would permit an API/MCP bypass.
- Regenerated `satisfy` now resolves the predecessor in-tenant and checks its live status is `completed` before setting `isSatisfied`; direct command callers cannot unlock a task early.

## UI direction

- Preserve the current production/KDS language.
- Show prerequisites as operational sequencing information: concise blocker count, predecessor names/status, and a disabled start action with a useful reason.
