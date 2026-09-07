# Auth

## Stack

- **Clerk** — browser identity (`@clerk/react`), publishable key in Vite env.
- **Convex + Clerk JWT** — `convex/auth.config.ts` validates tokens via `CLERK_JWT_ISSUER_DOMAIN`.
- **API keys (remote agents)** — a Capsule user creates a long-lived Clerk API key under Administration → API keys (authored seam `convex/apiKeys.ts` → Clerk Backend API; Clerk's `<APIKeys />` manages ORG keys when a session has an active organization, so it is not used). Agents send it as `Authorization: Bearer ak_…` to `/api/manifest/*` on the APP host; `src/agent/CapsuleApiKeyGateway.ts` (Vercel function `api/manifest/[...path].ts`, Vite dev middleware) verifies it with Clerk, mints the OWNER's session JWT server-side, and forwards to the generated Convex dispatcher — so the key has exactly the owner's tenant + role and every guard runs unchanged. Revoking a key stops it within ~60 s (Clerk caches `apiKeys.verify` for a used key that long; measured 2026-08-28). Clerk needs "User API keys" enabled once (Dashboard → API keys).
- **AuthGate** — `src/app/AuthGate.tsx` blocks the shell until session + membership are ok.
- **Workspace membership** — `src/app/auth/WorkspaceMembershipPolicy.ts` decides claim / org readiness.
- **Server auth context** — `convex/lib/authContext.ts` maps `ctx.auth.getUserIdentity()` to `{ id, role, tenantId, roleSource }`. **Capsule role is owned by `Person`** (Admin → Permissions → Team roles) when an active Person is linked via `authSubjectId`. Clerk/IdP org-role claims are only a bootstrap fallback until that link exists. Fail-closed anonymous sentinels when unauthenticated.

## Staff sign-in (hire path)

Hiring on Admin → Permissions → Team roles creates the identity-provider account, links `Person.authSubjectId`, and emails a Capsule link (plus a password when they do not already have one). Staff open that email and land in the app. They do not visit a separate sign-up site or paste account ids. Resend uses `RESEND_API_KEY`, `CAPSULE_PUBLIC_APP_URL`, and `INVOICE_REMINDER_FROM_EMAIL` (or `CAPSULE_SIGNIN_FROM_EMAIL`). The identity provider secret (`CLERK_SECRET_KEY`) stays on the Convex deployment.

## Client gate flow

1. Missing `VITE_CLERK_PUBLISHABLE_KEY` → setup-required screen (no silent dev identity).
2. Unauthenticated → Capsule sign-in screen (embedded provider widget; no self-serve sign-up). Ticket links from hire email sign them in.
3. Authenticated → ClaimGate / membership checks (self-link by verified email if hire has not linked yet).
4. If several live Person rows share that email (or the same `authSubjectId`), pick one instead of failing closed: hinted workspace (active Clerk org), then a row already linked to this sign-in, then Admin/owner/system, then the oldest live row. Do not persist a cross-tenant pick when there is no tenant hint — ClaimGate stays not-ready and workspace buttons remain the recovery. Opening a workspace button awaits `setActive` until the session JWT tenant claim matches, then retries the link. A hint that does not match the already-linked pick rematches onto the live never-linked row in that tenant (previous `authSubjectId` cleared). Team roles is not the only recovery.
5. Workspace membership without a profile → `ensureAccountProfile` automatically creates the signed-in account's Person-backed Capsule profile, using provider profile details and the session's existing tenant/role. It does not select or modify imported people. Creation is transactional and idempotent; disabled or explicitly released accounts are not recreated.
6. Ready → children (AppShell + routes), only after `authStatus.accountId` matches the current sign-in and `personId` exists. The same status includes a minimal own-profile projection, so My Day and chat do not depend on finding the account in a paginated roster. Legacy email-based invitation recovery excludes externally imported people.

Person email is contact data, not a unique account key. Imported staff may share an email with a Capsule account without becoming that account. The former tenant/email uniqueness declaration was removed at its Manifest source and regenerated. Bootstrap preserves recognized Capsule roles; Clerk `member` and custom roles default to `staff`, not elevated access.

A single active, never-linked, non-imported hire with the account's verified email in the same workspace is reused automatically, including for org-member sign-ins. This preserves its assigned role, employment information and work. Multiple contact matches do not select an identity; imported records are excluded from both hire matching and released-account checks.

## My Day staff identity

My Day uses `authStatus.personId` and its tenant together with the signed-in subject and active Person record. A Clerk nickname does not invalidate a persisted staff link. Browser-local name selections are not authentication or account linking and are no longer used by this page.

The shared login boundary loads the Capsule profile before My Day or any other authenticated route opens. My Day's recovery component uses that same account setup, never a staff-name picker. Retry preserves the existing sign-in. Existing saved identities are retained; imported names, email collisions and browser selections do not choose a new identity. No identity-provider account or password is created during this bootstrap.

Regression evidence: `tests/my-day-account-identity.test.ts` covers the real My Day route with a nickname, account-switch rejection, server/tenant/subject selection, and mounted link recovery. This local proof does not certify an individual production account's mapping or deployment.

My Day offline snapshots and queued writes are scoped to the signed-in subject, workspace and linked staff record. Replay starts only after that identity resolves and stops between writes if it changes. Older unowned browser queues are not migrated to the next account; they remain stored with an explicit, confirmed discard option. No account change deletes them. Storage failures while queuing are shown instead of claiming the action was saved.

## Role source of truth

1. Sign-in proves **who** (`identity.subject`) and **which org/tenant** (`tenantId` / `org.id`).
2. If a hired `Person` in that tenant has `authSubjectId == subject`, `status == active`, and is not soft-deleted → **`Person.role` is `user.role`**.
3. Otherwise fall back to JWT/`org.rol` claim (legacy bootstrap). Hire + link under Admin → Permissions so Capsule stops depending on Clerk org roles for capabilities.
4. Org-wide capability toggles (`OrganizationCapabilitySetting` on Permissions) are **enforced**: `getAuthContext` loads disabled capability ids; generated `checkRole` fails closed for matching domain actions (e.g. `salesAccess` when Sales is off); shell nav hides those areas. They do not replace per-person Capsule roles — both apply. `adminAccess` / `staffAccess` / `manageAccess` are never stripped so Permissions stays reachable.

## Server rule

Generated mutations/queries must not invent identity. They call `getAuthContext` from the author seam. Customize identity → Capsule role mapping only in `convex/lib/authContext.ts`.

## Env

See `.env.example`: client `VITE_*` keys; Convex `CLERK_JWT_ISSUER_DOMAIN` and `CONVEX_FIELD_ENCRYPTION_KEY` via `bunx convex env set`.
