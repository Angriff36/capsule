# Organization and identity

> Owns the CapsuleX operator experience for Organization and Person. Authentication mechanics remain in [auth.md](auth.md); workforce scheduling and qualifications remain in [workforce.md](workforce.md).

## Purpose

Establish the tenant-scoped catering organization and the people allowed to operate it. This system answers “which organization am I working in, who is this operator, what role do they hold, and are they assignable?” It is not a generic user-management or API-key platform.

## Owned domain

| Source                     | Entities     | Operator meaning                                            |
| -------------------------- | ------------ | ----------------------------------------------------------- |
| `foundation/base.manifest` | Organization | Catering operator account and operating lifecycle           |
| `identity/person.manifest` | Person       | Tenant member, employment identity, role, auth-subject link |

`TenantScoped` and `SoftDeletable` are shared source mixins and do not receive standalone UI.

## Primary workspace

Use an **organization folio** with organization identity and lifecycle at the top, followed by a ruled team directory. Person detail is a compact personnel dossier: identity, role, employment type, status, contact facts allowed by policy, and links to assignments, availability, time, and qualifications.

## Core workflows

- Register, rename, suspend, reactivate, or deactivate the organization through generated commands.
- Hire a Person, correct identity, assign a Capsule role, deactivate/reactivate, and terminate.
- Link a Person to Clerk identity only through trusted/authored seams; never accept tenant or auth subject from arbitrary form state.
- Navigate from a Person to workforce-owned operational records without duplicating those editing surfaces.

## Cross-system handoffs

Person is referenced by event ownership, prep assignments, event assignments, shifts, time records, qualifications, delivery drivers, closeout checks, report ownership, and auth context. This workspace summarizes those relationships and links to the owning system.

## States and permissions

Organization lifecycle actions and role assignment are high-consequence administrative commands. The UI must distinguish policy denial from illegal lifecycle state and must not expose Capsule-Pro platform concepts such as API keys, feature flags, or notification settings without canonical source.

## Current status

Generated queries, mutations, schema, and client capabilities exist. No authored Organization/Person workspace or routes exist. Clerk/AuthGate is shipping separately.

## References

- Canonical: `C:/projects/Manifest-source/src/foundation/base.manifest`, `C:/projects/Manifest-source/src/identity/person.manifest`
- Current auth system: [auth.md](auth.md)
- Read-only behavior reference: Capsule-Pro tenant/team and staff areas
