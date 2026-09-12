# In-app AI assistant

One chat drawer, mounted app-wide (`Ctrl+J` or the topbar sparkle button).

## Shape

- **Brain** — `convex/assistantTurn.ts` (authored node action). Calls a
  configurable OpenAI-compatible `/chat/completions` endpoint and returns the
  assistant message plus an execution spec for every requested tool call. It
  never touches data.
- **Hands** — the signed-in browser session. `src/features/assistant/assistantClient.ts`
  executes each tool call against the SAME generated mutations/queries the UI
  uses (`api.mutations.*` / `api.queries.*`). Authz is therefore identical to
  the UI — no separate AI surface, per
  `docs/generation/2026-07-17-command-api-surface-boundary.md`.
- **Tool surface** — `convex/lib/assistantToolSurface.ts`: ~69 curated write
  commands (events, kitchen, fleet, deliveries, pack lists, equipment,
  purchasing, vendor orders, shifts, time off, saved report definitions) + 29
  tenant-scoped reads. Money paths (invoices, payments, payroll) and staff
  administration (hire, terminate, pay rate, roles) are deliberately NOT on
  the surface.
- **Settings** — `src/features/admin/AssistantSettingsPage.tsx` at
  `/admin/assistant`, saved through the governed generated commands.
  Generated queries filter by the CALLER's tenant, so reads are bounded by the
  signed-in user's own access. The module is bundle-safe (no Node APIs) and
  replicates the capabilityId → mutation naming rule instead of importing the
  catalog (which loads `convex/mutations.ts` from disk).
- **UI** — `src/features/assistant/AssistantPanel.tsx` + `useAssistantChat.ts`
  (browser-in-the-loop, max 8 tool rounds, conversation is session-local and
  not persisted).

## Configuration

Set it in-app: **Administration → Assistant** (`/admin/assistant`, manage/admin
roles). Backed by the `AssistantLlmConfig` tenant singleton (`src/admin/assistant.manifest`);
the `apiKey` is a Manifest `private` field, so it is stored write-only — no read
path ever returns it. Only the turn action reads it, server-side, via the
internal seam query `assistantConfig.readForSubject` keyed on the verified
caller subject.

Deployment env vars (`ASSISTANT_LLM_BASE_URL` / `_API_KEY` / `_MODEL` via
`npx convex env set`) are the fallback when no row exists. Missing both → the
assistant replies with a clear "not configured" message.

## Truths kept honest

- Writes take effect immediately under the user's own identity; the system
  prompt tells the model to confirm retire/cancel/remove with the user first.
- Datetimes: the model may send ISO strings; the client converts to epoch ms
  (same rule as `src/agent/CapsuleCommandArgsNormalizer.ts`).
- Tool results are truncated to 6 KB of valid JSON before going back to the
  model.
- Conversation is not persisted; a page load clears it.
