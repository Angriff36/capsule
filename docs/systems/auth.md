# Auth

## Stack

- **Clerk** — browser identity (`@clerk/react`), publishable key in Vite env.
- **Convex + Clerk JWT** — `convex/auth.config.ts` validates tokens via `CLERK_JWT_ISSUER_DOMAIN`.
- **AuthGate** — `src/app/AuthGate.tsx` blocks the shell until session + membership are ok.
- **Workspace membership** — `src/app/auth/WorkspaceMembershipPolicy.ts` decides claim / org readiness.
- **Server auth context** — `convex/lib/authContext.ts` maps `ctx.auth.getUserIdentity()` (+ claims) to `{ id, role, tenantId }`. Fail-closed anonymous sentinels when unauthenticated.

## Client gate flow

1. Missing `VITE_CLERK_PUBLISHABLE_KEY` → setup-required screen (no silent dev identity).
2. Unauthenticated → Clerk `<SignIn />`.
3. Authenticated → ClaimGate / membership checks (org switcher when needed).
4. Ready → children (AppShell + routes).

## Server rule

Generated mutations/queries must not invent identity. They call `getAuthContext` from the author seam. Customize claim mapping only in `convex/lib/authContext.ts`.

## Env

See `.env.example`: client `VITE_*` keys; Convex `CLERK_JWT_ISSUER_DOMAIN` and `CONVEX_FIELD_ENCRYPTION_KEY` via `bunx convex env set`.
