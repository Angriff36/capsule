# PR12 — Protect each tenant's people and records

_Serves JTBD(s):_ Josh — trust staff and client access; Kayden — see only the work and personal information intended for them.

## Job Statement

Use production identity safely without exposing another tenant's records or losing access during legitimate onboarding and correction.

## Baseline and ownership

Draft requirements; shared contract: [production readiness](../../docs/product/production-readiness.md). Extend existing Clerk/Convex authorization, identity provisioning, file access, and notification preferences. Issue #265's production-key configuration is not reverified by this spec audit. Source inspection found password provisioning preceding local subject linking in `convex/authProvision.ts` (#249) and caller-supplied storage IDs resolved after a tenant check in `convex/fileStorage.ts`; these need targeted ownership tests, not a claim that a full security audit has occurred. Issues #236, #237, and #260 are further regression pointers.

## Acceptance Criteria

Owner decision, 2026-09-05: deployment may retain the current development Clerk instance through the explicit `VITE_CLERK_ALLOW_DEVELOPMENT_AUTH=true` allowance. The development-auth finding stays visible as a warning; this is not a claim of production-auth readiness. Actual malformed credentials and service mismatches remain blockers. This qualifies PR12-01 and AC-028 without requiring an authentication migration just to publish updates.

- [ ] PR12-01: Production startup/deployment checks detect mismatched Clerk issuer, application keys, Convex audience, callback URLs, and environment. Missing configuration produces a redacted actionable error; a development credential cannot silently qualify as production-ready.
- [ ] PR12-02: Identity provisioning verifies caller authority, intended tenant, and target identity before changing an external user's credentials. Failure or a conflicting link cannot reset another person's password; retry preserves the original identity relationship.
- [ ] PR12-03: The supported personal/no-organization onboarding path and organization path each resolve the intended tenant and branding. Lack of a Clerk organization is not an invented blanket prohibition if the product supports a person-owned workspace.
- [ ] PR12-04: List, detail, search, aggregate, mutation, background job, and agent-command access enforce tenant and role policies server-side. Direct IDs, omitted filters, guessed parent IDs, and cached clients cannot bypass those policies.
- [ ] PR12-05: File upload association, metadata, URL retrieval, download, and export verify the file's tenant and authorized parent record. Knowing a storage ID or attachment ID cannot grant access; an expired/revoked share stops issuing usable access under its documented policy.
- [ ] PR12-06: Public quote/proposal/payment routes expose only their intended public or scoped shared data. Expired/revoked links and changed revisions cannot reveal private notes, costs, personnel information, or another client's documents.
- [ ] PR12-07: Disabling an account or changing a role takes effect for existing sessions and background subscriptions. Device-level notification registrations obey current server preferences; disabling a channel cannot leave another device sending the same opted-out alerts.
- [ ] PR12-08: Sensitive credentials, tokens, raw payment details, and unnecessary personal data are excluded from browser bundles, ordinary logs, errors, and audit payloads. Authorized audit records preserve actor, tenant, action, time, target, and correction history without leaking secrets.
- [ ] PR12-09: Data retention/export/deletion operations identify the records and legal/business holds affected before execution. Deletion is scoped, authorized, auditable, and does not silently destroy required financial or employment history; normal operational edits do not gain unrelated approval gates.
- [ ] PR12-10: A negative-test matrix proves two tenants, each supported role, an unauthenticated caller, revoked access, direct storage IDs, and public links across all exposed entry points. Critical/high findings have verified fixes before readiness is claimed; untested surfaces remain explicitly unverified.

## Dependencies and proof

Cross-cutting prerequisite for all specs. Trace authored policy owners and generated dispatch; regenerate artifacts rather than adding a competing authorization layer. Use synthetic records and isolated identities for hostile tests; never expose production secrets or customer data in committed proof.

## Out of Scope

No compliance certification is claimed. Provider callback transport belongs to PR08, and disaster recovery belongs to PR13; both must satisfy this access boundary.

## Open Questions

The owner must choose retention periods and any regulated-data obligations before destructive retention is enabled. Until then, preserve data and restrict access; do not invent a deletion schedule.
