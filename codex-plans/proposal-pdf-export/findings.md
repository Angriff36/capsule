# Findings: Proposal PDF export

## Requirements

- Styled downloadable PDF.
- Event overview.
- Proposed menu with per-person pricing.
- Total estimate.
- Validity date.
- Terms.
- Intended for attachment to client sales emails.
- Temporary Playwright verification spec must be created, run, and deleted.

## Baseline

- Branch: `main`, ahead of `origin/main` by three commits at task start.
- Checkout has extensive pre-existing modified and untracked work.
- Shared app routing, styles, and several finance/client files are already dirty; treat them as user-owned baseline changes.
- `npx` is available, satisfying the Playwright skill prerequisite.

## Discoveries

- Canonical `Proposal` domain source already exists at `src/sales/proposal.manifest`, with authored UI at `src/features/clients/ProposalsPage.tsx` and generated hooks available through the app API seam.
- `jspdf` 4.2.1 is already installed, and `src/features/finance/invoicePdf.ts` is the established programmatic PDF/download pattern.
- Existing browser-print document pages are unsuitable for the stated attachment workflow; invoice export already proves direct PDF byte generation and download.
- Proposal UI is routed at `/clients/proposals`; adding a download action there may avoid touching the already-dirty shared `App.tsx` route table.
- Repository docs identify `ProposalLineItem` as not currently modeled, so the live proposal record shape must determine whether menu/pricing details are stored as proposal text or need authored presentation parsing.
- The live `Proposal` stores event date/type, guest count, venue name/address, subtotal/tax/discount/total, expiry, notes, and terms. It has no menu line-item entity or per-item prices.
- Per-person pricing can be truthfully derived as `subtotal / guestCount`; proposal totals remain the authoritative estimate.
- The current draft UI omits existing Proposal fields needed by the document (`eventDate`, `venueAddress`, `expiresAt`, `terms`) and labels `notes` generically. Wiring those existing fields requires no Manifest or generated-file edit.
- `ProposalsPage.tsx` itself is clean at baseline, while shared `App.tsx`, global CSS, package metadata, and lockfile already contain unrelated user changes. The feature can stay isolated to the clean proposal page plus a new authored PDF helper.
- The first sample rendered as a single US Letter page with a branded masthead, readable event overview, highlighted menu/per-person rate, aligned estimate summary, terms, and footer/page number. Poppler text extraction confirmed all required content is embedded.
- The sample's derived rate was `$150.00 / person` from an `$18,000` subtotal and `120` guests; the authoritative total estimate remained `$19,030.00` after discount and tax.
- A fill-state ordering issue initially made the menu card use the accent color. Resetting the intended paper fill immediately before drawing the card produced the final subtle, high-contrast layout.
