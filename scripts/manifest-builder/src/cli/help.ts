export const BUILDER_CLI_HELP = `Builder CLI — regenerate Manifest-governed applications safely.

Run from your application directory (like manifest, vite, or eslint).
Defaults: --target is the current working directory; --name comes from package.json.

Usage:
  builder generate convex [options]     Plan or apply Convex application regen
  builder migrate manifest-source ...   Import editable Manifest source (no regen)
  builder adopt ownership ...           Bootstrap ownership digests for legacy apps

Dry run is the default. Pass --apply to write. Use --json for machine-readable output.

generate convex options:
  --mode initial|update          Default: update
  --target <path>                Application directory (default: cwd)
  --name <name>                  Project name (default: package.json name)
  --manifest-source <path>       Required for initial mode only
  --dry-run                      Plan only (default)
  --apply                        Write a conflict-free plan
  --json                         Emit full JSON plan (default dry-run is human-readable)
  --destructive-override         Allow initial mode to overwrite generated paths
  --install                      Install when dependency requirements changed
  --allow-lifecycle-scripts      Allow package lifecycle scripts during install

migrate manifest-source options:
  --from <path>                  Source Manifest tree (required)
  --target <path>                Application directory (default: cwd)
  --dry-run                      Plan only (default)
  --apply                        Write imported source + editable ownership
  --json                         Emit full JSON plan

adopt ownership options:
  --target <path>                Application directory (default: cwd)
  --name <name>                  Project name (default: package.json name)
  --report <path>                Optional ASSEMBLY_REPORT.json path
  --dry-run                      Plan only (default)
  --apply                        Write .builder/ownership.json only
  --json                         Emit full JSON plan

Examples (from your app repo):
  cd /path/to/capsule
  builder generate convex --dry-run
  builder generate convex --apply
  builder generate convex --dry-run --json
  builder adopt ownership --apply
`;
