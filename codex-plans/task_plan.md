# Prep allergen container labels

## Goal
Add a printable dated food-label flow from existing prep-task and production-batch records.

## Plan
- [in_progress] Discover production data, UI entry points, and established print patterns.
- [pending] Define the smallest source-of-truth label model and implementation.
- [pending] Implement UI and any required query/seam changes.
- [pending] Run focused checks, required gate, and a temporary Playwright verification; remove the temporary test.

## Constraints
- Preserve existing work.
- Do not hand-edit generated files, commit, push, or deploy.
- Keep actions within the established design system and derive facts from existing records.
