# Reference catalogs: service styles, occasions, organizations

_Serves JTBD(s):_ Josh — replace TPP without a support call; Sales staff —
event creation never dead-ends on an empty dropdown; Clients — the public
quote form works.

## Job Statement

The reference tables that drive selectors (service styles, occasions, and the
organization row the public quote resolves its tenant from) must be
manageable from inside the app, so an empty catalog is a fixable condition,
not a broken event spine. Today both production dropdowns render empty and
the public quote fails when `organizations` has no active row (issue #119,
root cause #113 seed no-op — generator-side, not fixable in-loop).

## Acceptance Criteria

- [ ] An admin/owner can add, relabel, and retire service styles and
      occasions from the UI, and event-create selectors reflect the change
      without a redeploy
- [ ] Event create with zero service-style/occasion rows still lets the
      operator create the event (selector shows an explicit empty state, not
      a silent blank or a crash)
- [ ] The public quote form degrades the same way: missing catalogs never
      block submission, and the free-text fallback is captured
- [ ] A retired service style disappears from new-event selectors but
      remains on existing events and imports
- [ ] A runtime proof demonstrates the create-event path with empty catalogs
      and with populated catalogs

## Out of Scope

- Fixing `bun run seed` itself — generator-level, tracked as issue #113
- Migrating TPP catalog values — the import framework already owns that

## Open Questions

- Whether management belongs on the existing admin page vs a new
  settings surface — follow the existing admin pattern
