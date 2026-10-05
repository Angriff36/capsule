# Resolved issues

- 2026-10-05: The first temporary Playwright runner collided with the repository's existing test runtime. Replaced it with a direct Node/Playwright script; it successfully launched Chromium and proved the separate blocker is the absent port-7812 dev server. Deleted the temporary script after the attempt.

## 2026-10-05 — wizard retry safety and #435

- Replaced v2 post-success commit records with v3 pre-attempt records and payload fingerprints in `useEventWizardCommit.ts`; a missing result remains attempted, while a rejected write unlocks with a new idempotency key.
- Split optional-line validation from the list-empty rule and used the create rule on the Review button/guard, so skipped empty lists remain allowed but invalid entered lists cannot create.
- Moved demand provenance's direct Convex query from feature UI to `src/features/facilities/useDemandProvenance.ts`.
- Verified with `bunx vitest run tests/event-create-wizard.test.ts`, a temporary real generated-command convex-test proof, `bun run typecheck`, and `bunx vite build`.
