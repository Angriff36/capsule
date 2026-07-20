# Loop State — capsule

Last run: 2026-07-20T13:20:00Z (vertical-slice: Slice 7 Commercial and billing thin unit)

## High Priority (loop is acting or waiting on human)

- **Slice 7 shipped locally (`aff6960`) — not pushed**: `/finance` invoices + payments
  (issue→send→record→settle). Push only when human authorizes.
- **Auth unblock 2026-07-20**: Local Convex stuck on schema validation — dishes still had stored
  `allergenSummary` after it was converted to computed. Restored stored `property allergenSummary`
  + `classifyAllergens` in `src/culinary/dish.manifest`, `bun run manifest:regen`, restarted
  `convex dev` → functions ready. Reload UI.
- **Slice 6 shipped locally (`679afd6` + `b74ca0d`) — not pushed**: Packing/delivery workspace on
  Manifest 3.6.29. Push only when human authorizes.
- **All 6 Dependabot PRs blocked**: typescript 5.9→7.0, vite 6.4→8.1, react-router-dom 6.30→7.18,
  react-dom, @vitejs/plugin-react 4.7→6.0, actions/checkout 4→7.0. Major version upgrades require
  human risk decision per safety.md.

## Watch List

- Working tree carries ~72 modified + ~20 untracked paths — human's in-flight work (event prep coordinator,
  stock book tables, diagram docs), normal scale.
- `actions/checkout@v4` + Node 20 deprecation warnings — bump when convenient (blocked behind CI red).

## Recent Noise (ignored this run)

- GitHub CI API returned 503 during triage — cannot verify current CI status this tick.
- Prior issues RESOLVED: bun install local dependency, Builder ownership drift (resolved by recent commits).
- Prior issue RESOLVED: scripts/emit-proof-kit.ts:94 error (local run succeeds, was blocking earlier).
