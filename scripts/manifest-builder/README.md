# Capsule's Builder CLI

This directory contains the command-line source closure from Angriff36/builder,
with its upstream commit recorded in UPSTREAM.json. It is committed source,
versioned with Capsule; it is not a submodule, a sibling checkout, or a downloaded
runtime tool. The separate Builder UI is not needed to regenerate Capsule.

Run `bun install --frozen-lockfile` at the Capsule root. Manifest, YAML, and semver
resolve from Capsule's node_modules and bun.lock; there is no second install or
Manifest version synchronization. Run `bun run manifest:regen` to apply a
conflict-free plan and `bun run manifest:regen:check` to verify it.

Capsule adaptations:
- installedManifestVersion reads Capsule's root package.json.
- Manifest source discovery skips .artifacts and scripts as well as upstream's
  existing exclusions, so scratch checkouts cannot contaminate the domain graph.
- Source is formatted using Capsule's Prettier configuration.

To update: review changes against the upstream commit in UPSTREAM.json, port the
needed CLI changes into this directory, preserve the adaptations above, and
update provenance. Run regeneration, the regeneration check, and `bun run check`.
Commit generated changes and the ownership ledger together. Normal installation,
build, verification, and release never fetch the upstream repository.
