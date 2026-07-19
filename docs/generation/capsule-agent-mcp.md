# Capsule agent MCP (command bridge)

**Created:** 2026-07-17  
**Binding AC:** [2026-07-17-command-api-surface-boundary.md](./2026-07-17-command-api-surface-boundary.md)

Thin transport for IDE agents. Tools call the **same** Convex `createVia*` /
command mutations as the Capsule UI. No parallel AI API.

## Tools

| Tool                       | Purpose                                                                     |
| -------------------------- | --------------------------------------------------------------------------- |
| `list_capsule_commands`    | Discover AC capabilities from `manifest-wiring-contract.json`               |
| `describe_capsule_command` | Params + mutation name + emits for one capability                           |
| `execute_capsule_command`  | Run any catalog capability (`args` + optional `idempotencyKey`)             |
| `preview_recipe_document`  | Parse only — inspect lines/yield before writing                             |
| `enter_recipe_document`    | Write createVia path; requires `approveUnresolvedAsNew` for new ingredients |

## Setup

1. Convex + Clerk working for the UI (session token claims `role` + `tenantId`).
2. Sign into Capsule with a workspace org, then: `bun run agent:mint-jwt`
   (writes `CAPSULE_AGENT_JWT` into `.env.local`).
3. Ensure `CONVEX_URL` is set.
4. Run: `bun run agent:mcp`

### Cursor MCP config (example)

```json
{
  "mcpServers": {
    "capsule-commands": {
      "command": "bun",
      "args": ["run", "scripts/capsule-mcp.ts"],
      "cwd": "C:/Projects/capsule",
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "CAPSULE_AGENT_JWT": "<paste-jwt>"
      }
    }
  }
}
```

## Agent prompt (copy-paste)

Use the locked prompt in
[AGENT_PROMPT_ENTER_RECIPE.md](./AGENT_PROMPT_ENTER_RECIPE.md)
(`bun run agent:enter-recipe` — works without MCP).

## Proof

```bash
bun run test tests/agent/capsule-command-catalog.test.ts tests/proofs/agent-document-enter.runtime.test.ts
```

Document-enter + idempotent retry are proven under `convex-test` without a live
JWT. Live MCP requires `CAPSULE_AGENT_JWT`.

## Out of scope here

- Manifest `@manifest/mcp-server` (authoring compile/execute on IR — not Capsule persistence)
- Empty `convex/http.ts` public dispatcher (partners/mobile later)
- OCR of scanned cookbooks
