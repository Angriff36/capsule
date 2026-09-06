# Production readiness comparison

Baseline cf23268. Requirements pack originally audited279f6a3 and predates import R2 and wiring repairs. Its historical baseline is not a current gap list. This audit must trace current owners before proposing work.

States: missing; partial; implemented-unverified; configuration-blocked; verified with stated evidence scope. No fresh authenticated production qualification is claimed.

Root owns PR12-14 and cross-domain reconciliation. Independent source audits cover PR01-04, PR05-08, PR09-11. Reports record criterion IDs, existing source/test evidence, actual gaps and operator-visible outcomes.

Initial root trace: PR12 file URL tenant filtering is already implemented in convex/fileStorage.ts (storageReferencedByTenant); existing file-storage-ownership runtime proof covers tenant references. Do not plan to build that again. Full authorized-parent/read-role boundary is broader: Attachment(any parent) qualifies a storage URL, listForParent does not resolve parent authorization, and orphan discard checks references rather than upload ownership. Scope these as remaining targeted boundary work, not a claim of a production exploit.

Auth provisioning still calls external setPassword before linkProvisionedSubject rejects conflicting identity (convex/authProvision.ts); PR12-02 requires an identity reservation/validated external-effects workflow. Personal/no-org auth already exists in authContext/authLink; do not impose org-only onboarding. Existing release cf23268 is proof of deployment, not full PR13 receipt: CLI omits SHA and authenticated registry leg lacked credentials. src/main.tsx automatic stale-chunk reload exists but is not proof unsaved forms survive.
