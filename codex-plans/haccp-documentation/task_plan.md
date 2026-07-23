# HACCP documentation feature plan

## Goal

Store an operation's HACCP plan as structured records for hazards, critical control points, critical limits, and monitoring procedures, then make temperature and sanitation evidence traceable to its CCP in the product UI.

## Constraints

- Preserve all unrelated dirty and untracked work.
- Author domain behavior in `src/**/*.manifest`; never hand-edit generated ownership paths.
- Use only `bun run manifest:regen` for generated Manifest/Convex output.
- Do not add or expand permanent tests; use a temporary Playwright verification spec and delete it afterward.
- Run the focused verification and `bun run check` before completion.

## Phases

1. **Explore existing domain and UI patterns** — in progress
2. **Design the smallest coherent domain/UI slice** — pending
3. **Implement authored sources and regenerate** — pending
4. **Run focused static verification and repository gate** — pending
5. **Run temporary Playwright feature verification and remove it** — pending
6. **Review final diff and archive plan** — pending

## Errors encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Multiple live Codex sessions are actively rewriting the shared checkout, including generated ownership paths and overlapping event/UI surfaces | 1 | Stopped before implementation per `AGENTS.md`; resume in a non-overlapping checkout or after the other sessions finish. |

## Concurrency check

- Potential active overlap detected with the `sanitation-checklist` feature. Do not edit shared quality/navigation/generated surfaces until its status and file scope are known.
- Confirmed live Codex sessions started at 10:29 and 11:16, generated files rewritten at 11:33, event/UI edits through 11:36, and a new Playwright server at 11:37. Implementation and regeneration are blocked in this shared checkout.
