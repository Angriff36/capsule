# Fixes Log

Archived: 2026-07-16

## 2026-07-16

- Issue: Entity-owner validator falsely counted `Event` twice because PowerShell matching was case-insensitive and matched `event-closeout.manifest`.
  Fix: Changed the entity comparison to case-sensitive `-cmatch`; all 43 business entities then had exactly one owner.
  Commands: PowerShell owner-section validator; `bunx prettier --check DESIGN.md README.md docs/**/*.md codex-plans/*.md`.

- Issue: Baseline root cap did not account for the intentionally adopted root `DESIGN.md` authority.
  Fix: Raised the durable cap from 37 to 38 with an in-place documented correction; temporary `codex-plans/` is archived before final verification.
  Commands: `bun run baseline:decay`.
