# Auth

## Stack

- **Clerk** — browser identity (`@clerk/react`), publishable key in Vite env.
- **Convex + Clerk JWT** — `convex/auth.config.ts` validates tokens via `CLERK_JWT_ISSUER_DOMAIN`.
- **API keys (remote agents)** — a Capsule user creates a long-lived Clerk API key under Administration → API keys (`<APIKeys />`). Agents send it as `Authorization: Bearer ak_…` to `/api/manifest/*` on the APP host; `src/agent/CapsuleApiKeyGateway.ts` (Vercel function `api/manifest/[...path].ts`, Vite dev middleware) verifies it with Clerk, mints the OWNER's session JWT server-side, and forwards to the generated Convex dispatcher — so the key has exactly the owner's tenant + role and every guard runs unchanged. Revoke = instant. Clerk needs "User API keys" enabled once (Dashboard → API keys).
- **AuthGate** — `src/app/AuthGate.tsx` blocks the shell until session + membership are ok.
- **Workspace membership** — `src/app/auth/WorkspaceMembershipPolicy.ts` decides claim / org readiness.
- **Server auth context** — `convex/lib/authContext.ts` maps `ctx.auth.getUserIdentity()` to `{ id, role, tenantId, roleSource }`. **Capsule role is owned by `Person`** (Admin → Permissions → Team roles) when an active Person is linked via `authSubjectId`. Clerk/IdP org-role claims are only a bootstrap fallback until that link exists. Fail-closed anonymous sentinels when unauthenticated.

## Staff sign-in (hire path)

Hiring on Admin → Permissions → Team roles creates the identity-provider account, links `Person.authSubjectId`, and emails a Capsule link (plus a password when they do not already have one). Staff open that email and land in the app. They do not visit a separate sign-up site or paste account ids. Resend uses `RESEND_API_KEY`, `CAPSULE_PUBLIC_APP_URL`, and `INVOICE_REMINDER_FROM_EMAIL` (or `CAPSULE_SIGNIN_FROM_EMAIL`). The identity provider secret (`CLERK_SECRET_KEY`) stays on the Convex deployment.

## Client gate flow

1. Missing `VITE_CLERK_PUBLISHABLE_KEY` → setup-required screen (no silent dev identity).
2. Unauthenticated → Capsule sign-in screen (embedded provider widget; no self-serve sign-up). Ticket links from hire email sign them in.
3. Authenticated → ClaimGate / membership checks (self-link by verified email if hire has not linked yet).
4. Ready → children (AppShell + routes).

## Role source of truth

1. Sign-in proves **who** (`identity.subject`) and **which org/tenant** (`tenantId` / `org.id`).
2. If a hired `Person` in that tenant has `authSubjectId == subject`, `status == active`, and is not soft-deleted → **`Person.role` is `user.role`**.
3. Otherwise fall back to JWT/`org.rol` claim (legacy bootstrap). Hire + link under Admin → Permissions so Capsule stops depending on Clerk org roles for capabilities.
4. Org-wide capability toggles (`OrganizationCapabilitySetting` on Permissions) are **enforced**: `getAuthContext` loads disabled capability ids; generated `checkRole` fails closed for matching domain actions (e.g. `salesAccess` when Sales is off); shell nav hides those areas. They do not replace per-person Capsule roles — both apply. `adminAccess` / `staffAccess` / `manageAccess` are never stripped so Permissions stays reachable.

## Server rule

Generated mutations/queries must not invent identity. They call `getAuthContext` from the author seam. Customize identity → Capsule role mapping only in `convex/lib/authContext.ts`.

## Env

See `.env.example`: client `VITE_*` keys; Convex `CLERK_JWT_ISSUER_DOMAIN` and `CONVEX_FIELD_ENCRYPTION_KEY` via `bunx convex env set`.
