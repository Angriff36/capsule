# Fixes log

## 2026-10-05
- Issue: List scroll was saved in passive cleanup after an incoming route could restore the persistent shell scroller.
  Fix: Persist scroll in layout cleanup and observe workspace-sheet content while retaining a pending target during loading.
  Commands: `bun run typecheck`
- Issue: Detail returns treated any saved URL as proof that browser Back was safe and broke modified-anchor behavior.
  Fix: Added entry-key/history-index origin tracking and `ReturnToListLink`, which only consumes Back when the immediate predecessor matches.
  Commands: `bun run typecheck`
