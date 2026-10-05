# Sticky context header repair

## Goal
Repair the existing sticky context header on event, recipe, and invoice detail pages so it exposes live identity facts and one visible primary action after the route masthead scrolls away.

## Phases
- [in_progress] Inspect existing implementation, route integrations, shared components, and browser harness.
- [pending] Refactor the sticky header into a focused reusable component and repair page integrations.
- [pending] Add Storybook/catalog coverage and run static verification.
- [pending] Run temporary Playwright verification, delete its artifact, and record results.
- [pending] Prepare the worktree for independent review.

## Constraints
- Preserve existing user changes and do not edit generated or Manifest files.
- Follow DESIGN.md: solid panel surface, fine rule, established tokens, no glass effect.
- Do not add permanent tests; use and remove the required temporary Playwright check.
- Do not commit, push, deploy, merge, or alter global configuration.
