# System overview

CapsuleX is a catering / event operations workspace.

```
Browser (Vite + React)
  └─ AuthGate (Clerk session + org membership)
       └─ AppShell / nav
            └─ Feature routes (src/features/**)
                 └─ Convex React hooks via src/lib/api.ts
                      └─ Convex backend (generated surfaces + author seams)
                           └─ Clerk JWT validation (convex/auth.config.ts)
```

| Layer    | Role                                                                        |
| -------- | --------------------------------------------------------------------------- |
| UI       | Authored React shell and feature slices under `src/`                        |
| Convex   | Data plane: schema, queries, mutations (mostly Manifest-generated)          |
| Clerk    | Identity provider; org membership gates workspace access                    |
| Manifest | IR proofs assembled by Builder (`convex-application` preset) into this repo |

Entry points:

- Client: `src/main.tsx` → `src/app/App.tsx`
- Auth: `src/app/AuthGate.tsx` + `convex/lib/authContext.ts`
- API import: always `src/lib/api.ts` (never deep-import generated Convex API)

See [boundaries](boundaries.md) and [generation/manifest-builder](../generation/manifest-builder.md).
