# PR02 — Resolve legacy records to canonical identities

_Serves JTBD(s):_ Josh — replace TPP without duplicate data; sales — retain every client's history.

## Job Statement

Recognize the same person, venue, catalog item, or event across source reports so operators correct an ambiguity once.

## Baseline and ownership

Draft requirements; shared contract: [production readiness](../../docs/product/production-readiness.md). Owners: `src/import/external-record-link.manifest`, `convex/importCommit.ts`, `src/sales/contact-merge.manifest`, `src/operations/service-style.manifest`, `src/operations/venue-note.manifest`, and the existing catalog/admin screens. Source-specific name hashes currently bridge missing IDs. Contact task histories were attached as source documents; one section had multiple candidate clients. Issues #272, #270, #119 and #241 are evidence leads, not automatic proof that every reported gap remains open in code.

## Required behavior

Use source IDs first and tenant-scoped, recorded matching rules next. A missing legacy ID gets a stable source identity with provenance, not an invented authoritative TPP ID. Distinguish contact, company, employee, vendor, venue, finished dish, recipe, prep instruction, equipment, and inventory item. Preserve alternate names and historical links through merges. Map each source field to its existing owner before adding a field.

## Acceptance Criteria

- [ ] PR02-01: Coverage includes contacts/companies and contact history; historical/open events and leads; venues/detail notes; staff directory; service style/occasion/referral/salesperson; catalog categories, packages, seasonal/effective prices; and equipment references. Every present source field is mapped, preserved as evidence, or explicitly unresolved.
- [ ] PR02-02: Exact source-ID matches run automatically. Same-name people, shared email addresses, renamed venues, name truncation, and spelling variants are not silently merged; only the ambiguous record needs a decision.
- [ ] PR02-03: An operator can choose an existing record, create a correctly typed record, or correct a mapping in the source/result view. The resolution can be reused for the same source identity; bulk application previews its affected records.
- [ ] PR02-04: Imported single-name people, companies without named contacts, missing email, international phone/address text, and original source spelling survive without fake surnames, email addresses, or default locations.
- [ ] PR02-05: Corrections preserve source links and user-edited fields. Merge/relink updates dependent records without orphaned history; a failed multi-record correction is resumable and reports progress.
- [ ] PR02-06: Imported contact communications and tasks become readable, searchable history under their real client/event with original timestamps and completion state. JSON attachments alone do not meet the normal history workflow; no import sends messages or reopens completed tasks.
- [ ] PR02-07: Venue supplements, contact birthdays, staff postal addresses, and other mapped report fields persist in their owning records or explicit source fields and appear in their applicable reports. Missing values display as unknown, not fabricated data.
- [ ] PR02-08: Category, package, season, and price changes affect eligible new selections but do not mutate accepted commercial snapshots. Unknown service styles remain traceable and resolvable without blocking unrelated events.
- [ ] PR02-09: Reload and replay preserve the mapping decision. Native and imported records use the same normal edit, search, permission, archive, and detail paths.

## Dependencies and proof

PR01 supplies provenance. PR03 owns recipe/ingredient distinctions; PR06 owns public pricing/snapshots; PR09 owns employee access. Prove duplicate identities, shared email, renamed entities, and an interrupted merge with existing merge-command tests.

## Out of Scope

No product capability is excluded. This owns identity and field mapping, not the accounting calculations in PR05 or provider identity ownership in PR08/PR12.

## Open Questions

Conflicting source identities need record-specific evidence or an operator selection. No global match threshold may silently replace that decision. Existing approved TPP mappings must be located before inventing new status mappings.
