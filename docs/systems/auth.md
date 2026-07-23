# Auth

## Stack

- **Clerk** — browser identity (`@clerk/react`), publishable key in Vite env.
- **Convex + Clerk JWT** — `convex/auth.config.ts` validates tokens via `CLERK_JWT_ISSUER_DOMAIN`.
- **AuthGate** — `src/app/AuthGate.tsx` blocks the shell until session + membership are ok.
- **Workspace membership** — `src/app/auth/WorkspaceMembershipPolicy.ts` decides claim / org readiness.
- **Server auth context** — `convex/lib/authContext.ts` maps `ctx.auth.getUserIdentity()` to `{ id, role, tenantId, roleSource }`. **Capsule role is owned by `Person`** (Admin → Permissions → Team roles) when an active Person is linked via `authSubjectId`. Clerk/IdP org-role claims are only a bootstrap fallback until that link exists. Fail-closed anonymous sentinels when unauthenticated.

## Client gate flow

1. Missing `VITE_CLERK_PUBLISHABLE_KEY` → setup-required screen (no silent dev identity).
2. Unauthenticated → Clerk `<SignIn />`.
3. Authenticated → ClaimGate / membership checks (org switcher when needed).
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
