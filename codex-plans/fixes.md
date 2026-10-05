# Fixes log (resolved issues)

## 2026-10-05
- Issue: List scroll was saved in passive cleanup after an incoming route could restore the persistent shell scroller.
  Fix: Persist scroll in layout cleanup and observe workspace-sheet content while retaining a pending target during loading.
  Commands: `bun run typecheck`
- Issue: Detail returns treated any saved URL as proof that browser Back was safe and broke modified-anchor behavior.
  Fix: Added entry-key/history-index origin tracking and `ReturnToListLink`, which only consumes Back when the immediate predecessor matches.
  Commands: `bun run typecheck`

## 2026-10-04 - truthful cascade feedback and purchasing scope
- Removed the pre-approval ingredient-demand count from the event success notice because the generated transaction can repair eligibility before it creates purchase needs.
- Added `usePurchasingScopeViewModel` so “Show all events” clears the explicit route filter and the page-local working-event scope together.
- Added the real `ActionResultHost` Storybook states and focused cascade-message test. `bunx vitest run tests/automation-cascade-feedback.test.ts` and `bun run build-storybook` passed.
