# Mobile event view — detail for the goal

The goal text (≤4000 chars) points here. Both bind.

## Environments and acceptance data

- Production, READ-ONLY reference:
  https://capsule-tau-eight.vercel.app/events/nn7ez3fz56ya246m6p17az2ad58crnwg
  ("Mendenhall / Jarvis Wedding", invoice 6153). Inspect it to learn the real
  data shape and before-state. Never write to it.
- Vercel Preview deployments use their own Convex deployment (vercel.json
  points previews at tangible-skunk-448) and their own Clerk environment.
  Jarvis will not exist there. Never point a Preview at production Convex or
  change environment configuration to obtain fixture data.
- For Preview/dev acceptance use existing preview/dev fixture data if it
  covers all nine sections; otherwise create the smallest disposable fixture
  that does (UI or governed commands). No fixture framework. No production
  edits.
- Local dev: http://localhost:7811, already running — never restart it. Its
  Convex is the dev deployment; the Monasmith demo event lives there.

## Mobile shell and overview

- Bottom tab bar under 768px (Events / Today / Kitchen / More), sticky back
  header, touch targets ≥ 44px, primary content and form controls ≥ 16px
  (captions, badges, metadata keep token sizes), no horizontal overflow under
  430px. The sidebar already hides at max-md (src/app/shell/Sidebar.tsx).
- Event overview on mobile: one scrolling page of section cards in this
  order — Facts, Menu (grouped by course), Timeline, Staff, Prep, Pack list,
  Client & contacts, Notes, Money. Each card has "see all" opening the
  existing full tab; that tab must be usable below 430px. Wrap existing
  components (EventMenuTab, EventStaffingTab, timeline, pack-list pages); do
  not rewrite. Desktop unchanged at ≥ 1024px. Split files before ~400 lines.
- Design tokens from src/styles/app.css and the repo card recipe; no new
  arbitrary sizes (check:design-vocab stays green).

## PWA / offline

- Manifest (name, 192/512 icons, Apple touch icon, start_url, display
  standalone, theme color) linked from index.html; service worker registered
  at the app root that precaches the app shell.
- The cached shell must render an explicit "offline — sign in and data need a
  connection" state even when Clerk cannot reach its servers. This must not
  bypass AuthGate, manufacture an authenticated state, persist Clerk
  credentials, or expose uncached protected data. Clerk web auth has no
  offline mode; do not weaken AuthGate.
- Optional, read-only: last-opened event snapshot persisted client-side
  (IndexedDB or similar — not the service worker caching Convex responses),
  only if it needs no AuthGate change and stores no credentials. If unsafe,
  ship without it and say so.

## File locations

- Feature work in src/features/** and src/app/shell/**.
- PWA infrastructure exception only: public/manifest.webmanifest,
  public/icons/*, the service worker and its registration at the app root,
  manifest/theme-color/apple-touch-icon links in index.html, a minimal
  vite.config.ts change if needed. Nothing else outside those.

## Device verification

- Phone-viewport verification in a real browser at 390x844 and 360x800.
  Verify Android installability, standalone launch, and the offline shell.
- Verify iOS requirements in code (manifest, standalone display, Apple touch
  icon, viewport, Safari install metadata). Do not claim iOS Add to Home
  Screen was tested unless an iOS Safari target exists; otherwise report
  "manual iOS install acceptance remaining". Not a failure.
- Screenshots go under .artifacts/ (gitignored); they hold client and money
  data. Never commit them or paste them into the PR.

## Constraints

- CLAUDE.md and AGENTS.md bind. No hand edits to generated Convex/Manifest
  trees. No new guards/approvals/validations
  (docs/architecture/domain-gating-restraint.md). No invented deferrals.
  Blockers → GitHub issue in Angriff36/capsule the same session.
- Gates before every commit: bun run typecheck, bun run check:design-vocab,
  focused vitest on touched files; bun run check before the final commit.
  Commit small and often.
- Git: feature branch; pushing the branch and opening the PR is authorized;
  merging is not (cross-model review gate in CLAUDE.md).
