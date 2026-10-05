# Findings: automation cascade feedback toasts

- `EventApproved` first repairs calculated demand eligibility, then creates purchase needs for `purchaseEligibleEventId = eventId`; the promise returned by `useEventApprove` resolves after that transaction.
- `WasteRecorded` adjusts the selected inventory item in the same completed transaction.
- The app shell uses one `ActionResultHost`; it currently supports a message only.
- `/inventory/purchasing` already scopes orders to the working event, but not purchase needs and not an explicit `?event=` URL.
- `/inventory/stock?item=<id>` is the established stock-line focus route.
- The approval mutation does not return a purchase-need creation count, so its UI feedback must state only the completed, truthful planning outcome.
- A cascade URL must clear both `event` from the address and the screen-local working-event scope; otherwise the latter immediately re-applies the filter.
- The current uncommitted implementation uses `AutomationCascadeFeedbackManager` as the single message/link mapping seam, then publishes through the existing shell-level `ActionResultHost`; it avoids a second page-local toast host.
- `usePurchasingScopeViewModel` gives an explicit `?event=` link precedence over the tab-local working event and clears both scopes when the user chooses "Show all events".
- The generated approval mutation returns the Event record, not a reaction-derived count. The approval copy is intentionally outcome-truthful (planning finished) rather than guessing how many needs were created.
