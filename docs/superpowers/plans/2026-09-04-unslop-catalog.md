# Unslop Culinary Catalog Implementation Plan

> **For agentic workers:** Execute this plan directly in the isolated feature worktree. Do not dispatch subagents. Capsule's owner rule forbids adding or expanding tests; use the existing repository gates and browser verification instead.

**Goal:** Replace the all-record culinary card grid with a fast operational index and a Capsule-Pro-style record inspector, then record the reusable anti-slop review method for the rest of the authored app.

**Architecture:** Keep the existing Manifest list hooks and lifecycle commands. Filter and sort their results in `KitchenCatalogPage`, render only a small visible window in a semantic ledger, and mount image resolution only for the one selected record inside a shared accessible preview sheet. Keep `DESIGN.md` as the presentation authority; use the Unslop profile only as an avoid-focused review lens.

**Tech Stack:** React 18, TypeScript, Vite, Convex hooks, React Router, authored CSS tokens from `src/styles/app.css`.

## Constraints

- Do not edit generated Manifest or Convex output.
- Do not add or expand tests.
- Preserve all create, open, lifecycle, search, and hidden-record behavior.
- Do not add client-side policy or validation.
- Keep the production design inside `DESIGN.md` colors, typography, radii, responsive behavior, and accessibility rules.
- The visual counterprofile must not replace the Capsule design system.

## Tasks

### 1. Add reusable preview and virtual-list foundations

Create an accessible portal-based record preview sheet with focus trapping, focus restoration, Escape/backdrop dismissal, body-scroll locking, and desktop-right/mobile-bottom composition. Create a small fixed-row virtual-window hook that exposes only the visible slice plus overscan.

### 2. Replace the culinary card grid

Replace `KitchenCatalogCards` with a catalog ledger that renders bounded rows, provides keyboard row activation, preserves lifecycle actions, and opens the preview sheet on a single click. Resolve a dish or ingredient image only inside the open sheet.

### 3. Improve catalog navigation and retrieval

Add category filtering and explicit name/category sorting beside the existing search and hidden-record toggle. Derive categories from live records and reset selection safely when filters or route sections change.

### 4. Apply the approved anti-slop review method

Record a compact route-family inventory and source-level findings for authored pages. Add the approved Unslop review lens to the design documentation as non-authoritative quality guidance: fix shared causes first, preserve intentional specialist workspaces, and avoid repeated cards/pills/hero scaffolding when a ledger or document structure is more useful.

### 5. Verify and release safely

Run formatting, typecheck, existing tests, build/check, focused browser verification at desktop and mobile sizes, and inspect console/network behavior. Obtain an independent cross-model UI review with `DESIGN.md` attached. Commit and push only the feature branch; use the repository release script only if every required gate is green.
