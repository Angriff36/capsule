# Task Plan: CapsuleX system design and documentation alignment

Archived: 2026-07-16

## Goal

Understand CapsuleX, Capsule-V2, Capsule-Pro, and the canonical Manifest source inventory; then adapt the copied design goal to CapsuleX and establish consistent, authoritative system documentation for every Manifest-backed system that should be brought into this app.

## Current Phase

Complete

## Phases

### Phase 1: Requirements and repository discovery

- [x] Confirm repo boundaries, dirty state, and local instructions
- [x] Inventory current docs, UI structure, generated support, and copied `DESIGN.md`
- [x] Inventory Capsule-V2 and Capsule-Pro reference systems
- [x] Inventory canonical Manifest sources under `C:/projects/Manifest-source/src`
- [x] Run Graphify-backed architecture analysis
- **Status:** complete

### Phase 2: Authority map and design adaptation

- [x] Define one authoritative source of truth per system
- [x] Map Manifest-backed systems to CapsuleX feature/doc ownership
- [x] Adapt `DESIGN.md` goal and principles to this repo's generated architecture
- [x] Resolve material product questions with the user or record safe assumptions
- **Status:** complete

### Phase 3: Documentation implementation

- [x] Update the authoritative design document
- [x] Add only the system docs and indexes needed for clear ownership
- [x] Remove or redirect conflicting claims without editing generated files
- [x] Validate coverage, links, and doc consistency
- **Status:** complete

### Phase 4: Verification

- [x] Check links, structure, and source-system coverage
- [x] Run `bun install --frozen-lockfile`, outdated/audit checks, and `bun run check`
- [x] Separate touched-area failures from unrelated baseline issues
- **Status:** complete

### Phase 5: Delivery

- [x] Re-read docs as a coherent system
- [x] Archive the completed plan if the task is complete
- [x] Report dependency state, verification, risks, and implementation-ready next steps
- **Status:** complete

## Key Questions

1. Which Capsule-Pro behaviors are canonical product requirements versus legacy implementations?
2. Does “bring over all systems” mean design and document all systems now, then implement in slices, or begin implementing the first slice in this task?
3. What user roles and launch scope should drive navigation and prioritization?
4. Which docs already claim authority, and where do they conflict?

## Decisions Made

| Decision                                                                                                                   | Rationale                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Treat `C:/projects/Manifest-source/src` as canonical domain source                                                         | The user explicitly identified it as the source Manifest location.                                                          |
| Treat generated CapsuleX files as implementation evidence, not docs authority                                              | Project ownership marks them generated and forbids hand edits.                                                              |
| Keep edits in `C:/projects/capsule`; use sibling repos read-only                                                           | Prevent cross-repo drift while still using requested references.                                                            |
| `DESIGN.md` owns presentation; one file under `docs/systems/` owns each operator system; an index owns only mapping/status | This keeps authority singular while allowing navigation across docs.                                                        |
| Map all 43 business entities exactly once across system docs                                                               | Prevents duplicate product definitions and makes coverage mechanically reviewable.                                          |
| Treat this pass as design/docs foundation, not bulk UI implementation                                                      | The user's request centers on designing the rest of the app and documentation; no first implementation slice was specified. |

## Errors Encountered

| Error                                                                                                              | Attempt | Resolution                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required superpowers bootstrap executable not found at `C:/Users/Ryan/.codex/superpowers/.codex/superpowers-codex` | 1       | Searched the Codex directory; no matching entry point was installed. Continue under supplied AGENTS instructions and do not repeat the missing command. |
| AtomicViz/Graphify MCP tools are not exposed                                                                       | 1       | Found the locally installed `graphify.exe`; use the CLI directly.                                                                                       |
| Planning-file patch context mismatch                                                                               | 1       | Used targeted `rg` to correct the expected text before retrying.                                                                                        |
| Combined inspection command returned exit 1 without output                                                         | 1       | Split the operation and replaced `rg`-dependent status with PowerShell `Select-String`.                                                                 |
| Parallel validation failed on expected `git diff --no-index` difference                                            | 1       | Reran structural validation independently; Markdown links passed. Use non-zero-tolerant handling for comparison commands.                               |
| Graphify findings patch referenced the wrong planning file                                                         | 1       | Corrected the patch to update `findings.md` and `progress.md` separately.                                                                               |

| Phase-transition patches missed Prettier-adjusted context | 2 | Inspected the formatted planning files and reapplied smaller file-specific patches. |

## Notes

- Preserve unrelated dirty and untracked work.
- Do not hand-edit generated files listed in AGENTS.md.
- Re-read this plan before architecture and authority decisions.
