# Recipe review — browser qualification record (RR-5 / AC-046)

Dated: 2026-09-06. Scope: the ordinary component import review route
(`/kitchen/components/import`) exercised by a real, authenticated browser
against this checkout's frontend and a live local Convex backend, per
`specs/ralph/production-03-recipe-truth.md` PR03-01/08 and
`specs/ralph/production-14-qualification-cutover.md` PR14-03/04/05/07
(recipe delivery portion only — no production or full-product claim).

## Runnable procedure

The committed automation is `scripts/recipe-review-browser-qualification.ts`
(21 numbered checks, exit 1 on any FAIL, screenshots + `results.json` into the
shot directory). It is deliberately NOT part of `bun run check`: it needs a
live backend, a signed-in staff fixture, and a Chromium binary.

### 1. Bring up an isolated local backend (never the shared 3210 instance)

The primary checkout (`C:/Projects/capsule`) owns `127.0.0.1:3210`; `convex dev`
refuses to attach to another checkout's running backend, and pushing this
branch's functions there would swap the shared function set. Instead, from this
worktree with no `CONVEX_DEPLOYMENT` and no `.convex/` directory:

```bash
bunx convex dev --once --typecheck disable --tail-logs disable   # creates an anonymous local backend on a free port (3212)
bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://golden-koi-11.clerk.accounts.dev
bunx convex env set CONVEX_FIELD_ENCRYPTION_KEY <32-byte hex>
bunx convex dev --typecheck disable --tail-logs disable          # keep alive in the background (the --once run stops its backend)
```

`VITE_CONVEX_URL=http://127.0.0.1:3212` (plus the dev Clerk publishable key,
`VITE_CLERK_ALLOW_DEVELOPMENT_AUTH=true`, `CONVEX_URL`, `CONVEX_SITE_URL`,
`CLERK_SECRET_KEY` for fixture tooling) goes in this worktree's gitignored
`.env.local`. Restart the preview so Vite picks it up:

```powershell
powershell.exe -NoProfile -File ./ralph-preview.ps1 -Ensure -Port 7813
```

(The shared 7812 preview belongs to the sibling capsule-ralph checkout; leave
it alone.)

### 2. Fixture workspace (once per fresh backend)

Clerk dev instance `golden-koi-11` (owner-approved development-auth allowance,
2026-09-05; visible warning, never a production-auth claim):

1. Create the dev-instance user `ralph.rr5.20260906@example.com` with a
   password (a username is required by the instance) and a verified email via
   the Clerk Backend API (`sk_test` key from the primary checkout's
   `.env.local` — never committed).
2. Import two bootstrap rows through the official `convex import` CLI on the
   EMPTY backend only: one `organizations` row and one `people` row
   (`role: admin`, `authSubjectId: <clerk user id>`, email sealed with the
   same AES-GCM format as `convex/lib/encryption.ts`). Person-first auth
   (`convex/lib/authContext.ts`) then resolves tenant+role from the Person row
   — no Clerk org claims needed.
3. Create the priced match targets through the real governed command
   `Ingredient_createViaIntroduce` with a minted session token:
   "Heavy Cream" (liter, 4.50) and "Garlic" (kilogram, 8.00).

The script from this run is preserved (gitignored) at
`.artifacts/rr5/bootstrap.ts` with fixtures under `.artifacts/rr5/fixtures/`.
Unpriced ingredients are NOT seeded — they are created by the flows under
test, which is exactly what the missing-price checks observe.

### 3. Sign-in for the browser

Password sign-in on this dev instance demands an emailed new-device
verification code for every fresh browser (observed 2026-09-06; a human reads
that email). The unattended run uses the product's own staff invite mechanism
instead: `POST https://api.clerk.com/v1/sign_in_tokens` with the dev secret,
then visit `<app>/?__clerk_ticket=<token>` — the same link a manager's invite
email carries (`convex/lib/clerkSignInTicket.ts`).

### 4. Run

```bash
mkdir -p .artifacts/rr5/pw && cd .artifacts/rr5/pw
echo '{"name":"rr5-qualification","private":true}' > package.json
bun add playwright-core                      # scratch install; repo takes no new dependency
cp ../../../scripts/recipe-review-browser-qualification.ts qualify.ts
RR5_TICKET=<token> RR5_FIXTURE_DIR=<abs fixtures dir> \
RR5_EXECUTABLE=<chromium path; system Chrome hung under CDP here, cached ms-playwright chromium-1223 worked> \
RR5_SHOT_DIR=<abs shots dir> node --experimental-strip-types qualify.ts
```

(Bun's runtime could not complete playwright's CDP pipe launch on this
machine; Node 22 ran it fine.)

## What the 21 checks exercise

- **A (desktop 1280×800):** denied when signed out (workbench not rendered);
  authenticated entry; saved-reviews section (empty sentence on a fresh
  workspace); paste parse surfaces honest issues (missing yield, unknown
  "pinches" unit — "Capsule does not guess amounts or units") with finalize
  disabled; corrections clear the issues (mixed fraction 1 1/2 cup kept
  meaning) and enable finalize; durable save puts `?importId=` in the URL and
  the status span says Saved; read-only "Original source" panel shows the
  uncorrected raw paste; reload keeps corrections + source; finalize navigates
  to the new component; component detail shows the original source; the cost
  panel shows "Pricing coverage 1 / 3 lines" plus named gaps ("Pinches Smoked
  Salt needs a current cost per each." / "Huckleberry Compote needs a current
  cost per kilogram.") — missing price stays incomplete cost, never free food.
- **B (360×740):** mobile Source/Review tabs; CSV sheet+lines pair upload
  (fixture keeps `source_line` empty so the structured columns join — that
  column holds source TEXT when present); honest gaps (blank yield row parses
  to a missing-yield issue, not a default); corrections; save with
  "Sheet CSV (stored separately)" and "Lines CSV (stored separately)" blocks;
  finalize at 360 px reaching the component detail with the unpriced gap.
- **C (two tabs):** concurrent edit — dirty tab keeps its local edits against
  a newer saved revision ("Saved by someone else — your edits are kept."),
  offers "Reload saved version", and reload adopts the stored values (qty 2,
  yield 8). A clean editor silently adopting a newer revision is the designed
  non-destructive behavior — the conflict check dirties the tab first.
- **D:** finalize survives an interrupted acknowledgement — the request is
  dispatched, the tab navigates away, and reopening the importId shows the
  completed state with "Open component" (server truth wins; replay-safe).
- **E:** after sign-out, the saved import URL shows the sign-in screen and the
  source text is absent from the DOM — server-side denial, no leakage.

Field corrections are entered through keyboard-driven fills and unit selects;
pane buttons are activated by click. The live region and first-issue focus
exist in the UI (jsdom tests pin them); this run did not drive a full
Tab-only traversal, recorded here as an honest limit rather than a claim.

## Defect found by this qualification (fixed same iteration)

The normal paste → correct → save → finalize flow dead-ended with
`component import is reviewing; only ready or finalizing reviews can be
finalized`: nothing promoted a completed review to `ready`. The imperative
proofs called `ComponentImport.approveReview` explicitly, and the mounted
jsdom tests mock the hooks, so the missing wire was invisible to both —
exactly the integration gap PR14-04 exists to catch. Fix (this branch):

- `convex/lib/culinaryOperations.ts` `createComponentImportReview` now
  recomputes `resolvedLineCount` after staging decisions (the save
  transaction already did) so the ledger reflects create-time decisions.
- `ComponentImportRepository` gained an optional `approveReview` port, called
  after a successful create/save when the review is complete; the workbench
  wires it to the generated `useComponentImportApproveReview` hook (kitchen
  integration guard respected). Later corrections still demote via
  `resumeReview` and re-promote on the next completed save.

## Results — final pass 2026-09-07T00:55:39Z (2026-09-06 local), committed script verbatim, exit 0

21/21 checks PASS (full per-step log: `.artifacts/rr5/final-run.log`,
machine-readable results: `.artifacts/rr5/shots/results.json`, screenshots
`.artifacts/rr5/shots/01…21*.png` — kept local per the sanitized-evidence
rule). Representative observed values from that pass: importIds
`ks77v9qt6kfwd3e3qj4krre46d8dyemb` / `ks79f652k9q6n14rsw9p8954md8dyaw7` /
`ks7e04xkvhxs9708f4ytg4c90s8dykja`, components
`m974e934q24ry8r7pvarwgmt558dy1mz` / `m976epddtjqhnvgva7rfs606658dyfh6`,
coverage "1 / 3 lines" with the two named unpriced gaps above.

Repository gates (this checkout, same day): `bun run test` 164 files /
1408 tests green including AC-042–045 suites; `bun run typecheck`,
`bun run format:check`, `bunx vite build`, `bash lint_specs.sh specs/ralph`
(19 specs), and the manifest ownership check all green. Preview identity:
`ralph-preview.ps1 -Port 7813` verifies the served `src/main.tsx` source map
resolves to this checkout; `RALPH_PREVIEW_CHECK_CMD` is set in `.ralph.env`.

## Honest limits

- Local development environment only: dev Clerk instance under the
  owner-approved `VITE_CLERK_ALLOW_DEVELOPMENT_AUTH` allowance, anonymous
  local Convex backend, single-tenant fixture. No production, deployment, or
  full PR14 claim follows (PR14-01/02/06/08+ remain their own criteria).
- Historical AC-006/013 J receipts are still missing (ANTHROPIC_API_KEY
  unset) — unchanged by this record.
- Screenshots/results live under gitignored `.artifacts/` per the spec's
  redacted-evidence rule; this file is the committed evidence summary.
