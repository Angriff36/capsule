# Fixes: Recurring Event Scheduling

## Encrypted contact cloning

Generated encryption stores `{v,kid,ct}` in each serialized field envelope. The materializer clones only schema-declared encrypted fields rather than inventing companion key-id columns.

## Integral occurrence limits

Occurrence counts and generated-count event payloads use Manifest `int`, matching one-based integral series sequences.

## Temporary browser artifacts

The Playwright harness, result marker, and task screenshot were removed after the focused browser test and visual inspection passed.
