# Product and documentation authority

This document is the routing authority for CapsuleX truth. It defines where a claim belongs; it does not duplicate the claim.

## Authority order

| Question                                                                                                  | Authoritative source                                                                                                              | CapsuleX treatment                   |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| What is Capsule for? Who uses it?                                                                         | `C:/projects/Manifest-source/capsule-product-definition.md`                                                                       | Read-only product authority          |
| What entities, relationships, lifecycles, permissions, calculations, commands, events, and reactions mean | `C:/projects/Manifest-source/src/**/*.manifest`                                                                                   | Read-only canonical domain authority |
| What the current generated app contains                                                                   | `ASSEMBLY_REPORT.json`, `manifest-context-summary.json`, `src/generated/manifest-wiring-contract.json`, generated Convex surfaces | Generated evidence; never hand-edit  |
| Which generated behavior is verified or blocked in this checkout                                          | [`../generation/projection-status.md`](../generation/projection-status.md)                                                        | Local projection-status authority    |
| How CapsuleX looks and composes work                                                                      | [`../../DESIGN.md`](../../DESIGN.md)                                                                                              | Presentation authority               |
| What each operator system should accomplish and what UI exists                                            | The owning file under [`../systems/`](../systems)                                                                                 | One owner per system                 |
| Which systems exist and where they are documented                                                         | [`../systems/index.md`](../systems/index.md)                                                                                      | Scope/status router only             |
| What gets implemented next                                                                                | [`implementation-plan.md`](implementation-plan.md)                                                                                | Slice-order authority                |
| Authored/generated repository boundaries                                                                  | [`../architecture/boundaries.md`](../architecture/boundaries.md)                                                                  | Code ownership authority             |
| How the repository is generated                                                                           | [`../generation/manifest-builder.md`](../generation/manifest-builder.md)                                                          | Generation-flow authority            |

## Evidence rules

1. Product definition wins over existing application behavior.
2. Canonical Manifest source wins over Capsule-Pro schemas, routes, and previous Manifest files.
3. Compiled/generated artifacts prove what was projected, not what the product should mean.
4. Assembly success proves structural output, not end-to-end workflow correctness.
5. Capsule-Pro and Capsule-V2 are read-only references for behavior, edge cases, and visual continuity.
6. A system doc may summarize linked facts, but it must point to the owning system for edits and must not redefine another system's rules.

## Documentation rules

- Each governed business entity appears under exactly one owner in [`../systems/index.md`](../systems/index.md).
- System docs use the same structure: purpose, owned domain, workspace, workflows, handoffs, states/permissions, status, references.
- Do not copy field lists, policy expressions, or state machines from Manifest into prose unless the UI needs the distinction. Link to the source file instead.
- Do not maintain competing roadmap or parity tables in `DESIGN.md`, README, or individual system docs.
- When current generated behavior differs from canonical intent, record it once in [`../generation/projection-status.md`](../generation/projection-status.md) and link to it.
