/**
 * bunfig.toml preload. Every `bun` process on Windows puts Git Bash ahead of
 * the WSL stub so `bun run build` / `bun run check` can still call `bash`
 * without editing owned package.json (#338 remainder, #233).
 */
import { WindowsGitBashPath } from "./windowsGitBashPath.ts";

new WindowsGitBashPath().prependToPath();
