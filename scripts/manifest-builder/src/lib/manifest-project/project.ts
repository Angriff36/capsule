import { compileProjectToIR } from "@angriff36/manifest/multi-compiler";
import type { CompileResult, Diagnostic, ResolverHost } from "./types";
import { normalizeWorkspacePath } from "../localWorkspace";

const virtualPath = (path: string): string =>
  `/${normalizeWorkspacePath(path).replace(/^\/+/, "")}`;

function resolveVirtual(fromDir: string, relative: string): string {
  const parts = `${fromDir}/${relative}`.split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return `/${resolved.join("/")}`;
}

/** Browser-safe in-memory resolver for multi-file Manifest workspaces. */
export function createWorkspaceResolverHost(
  sources: Record<string, string>,
): ResolverHost {
  const files = new Map(
    Object.entries(sources).map(([path, source]) => [
      virtualPath(path),
      source,
    ]),
  );
  return {
    async readFile(path) {
      const source = files.get(virtualPath(path));
      if (source === undefined) throw new Error(`File not found: ${path}`);
      return source;
    },
    resolvePath: resolveVirtual,
    async fileExists(path) {
      return files.has(virtualPath(path));
    },
  };
}

function mapDiagnostic(diagnostic: {
  severity: string;
  message: string;
  line?: number;
  column?: number;
}): Diagnostic {
  const match = diagnostic.message.match(/^\[([^\]]+)\]\s*/);
  const path = match
    ? normalizeWorkspacePath(match[1] ?? "").replace(/^\//, "")
    : undefined;
  return {
    severity:
      diagnostic.severity === "error" || diagnostic.severity === "warning"
        ? diagnostic.severity
        : "info",
    message: diagnostic.message.replace(/^\[[^\]]+\]\s*/, ""),
    ...(path ? { path } : {}),
    ...(diagnostic.line === undefined ? {} : { line: diagnostic.line }),
    ...(diagnostic.column === undefined ? {} : { column: diagnostic.column }),
  };
}

/** Compile a multi-file Manifest workspace to a merged IR. */
export async function compileProject(
  sources: Record<string, string>,
): Promise<CompileResult> {
  if (Object.keys(sources).length === 0) {
    return { ir: null, diagnostics: [], errorCount: 0, warningCount: 0 };
  }
  const result = await compileProjectToIR({
    entries: Object.keys(sources).sort().map(virtualPath),
    host: createWorkspaceResolverHost(sources),
    basePath: "/",
    useCache: false,
  });
  const diagnostics = result.diagnostics.map(mapDiagnostic);
  return {
    ir: result.ir,
    diagnostics,
    errorCount: diagnostics.filter((d) => d.severity === "error").length,
    warningCount: diagnostics.filter((d) => d.severity === "warning").length,
  };
}
