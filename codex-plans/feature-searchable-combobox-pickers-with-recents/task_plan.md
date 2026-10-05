# Searchable foreign-key pickers

## Goal

Replace applicable dish, ingredient, client, vendor, and staff native selects with a shared accessible searchable picker that preserves existing ID contracts and stores five local, per-user recent choices.

## Phases

1. [in_progress] Discover target selects, shared UI, data identities, and existing form contracts.
2. [pending] Implement a shared picker and convert all in-scope form fields.
3. [pending] Add focused requested tests and run static/build verification.
4. [pending] Run and remove a temporary Playwright browser verification.
5. [pending] Inspect final diff and leave it ready for independent review.

## Constraints

- Do not edit generated files or deploy/push.
- Preserve existing save values and existing option scopes.
- Search runs only against already-loaded browser data.
- Follow DESIGN.md and reuse shared conventions.

## Errors encountered

| Error | Resolution |
| --- | --- |
| PowerShell parsed a brace-expanded `rg` path as invalid syntax. | Use separate quoted paths or a broader source scan. |
