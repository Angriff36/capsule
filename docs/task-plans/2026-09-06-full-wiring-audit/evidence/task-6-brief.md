### Task 6: Shared failure handling

Own AttachmentsSection.tsx and useSavedViews.ts plus focused tests/helpers.
Await attachment removal, catch into existing visible failure state, and disable duplicate pending removal. Saved-view default changes must not silently leave no default after a second write fails; use an existing atomic command or preserve/recover previous state with truthful error. Cover reject/success/pending and partial-failure behavior.

Additional bulk owner: ClientRetentionPage.tsx opening outreach tasks. Ensure retries do not duplicate open tasks after ambiguous commits (atomic ensure-open seam or stable generated idempotency keys), preserve ability to open a later task after prior task dismissal/completion, and show completed/remaining bulk counts. Preserve current uncovered-candidate filtering.

Verify shared form-retention candidate: RevenueAttributionDetailPage apply-amount effect depends on reactive event and can overwrite operator edits when event data refreshes. Add a mounted regression changing the event query after editing; if reproduced, initialize per apply context without overwriting edited amount/provenance. This is separate from Task2's now-correct estimate labels and must preserve them.

Saved views actually reuse owner-scoped SavedReportDefinition, chartType list-view, definition {pageKey,isDefault,state}. Prefer an authored atomic seam that loads the caller's current live defaults and target server-side, invokes existing create/update commands, and rolls back all changes on failure; do not introduce a competing SavedView entity. For outreach, ensure-open must return whether it created or reused a task, so single/bulk notices count actual creations accurately; preserve valid later outreach after complete/dismiss.

Correct the personal-view projection as part of default safety: useSavedViews currently assumes listSavedReportDefinition is owner-only, but generated queries intentionally also return managers' visible reports and shared reports. Personal view choices/default clearing must use the current person's rows for the page, not another owner's default. Preserve the broader report-management policy and shared-report feature; this is the personal list-view adapter's scope, not a global authorization change. Prove two owners' defaults remain independent even for a manager.
