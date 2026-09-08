export interface WorkspaceFile {
  path: string;
  source: string;
}
export interface LocalWorkspace {
  name: string;
  files: Record<string, WorkspaceFile>;
  activePath: string | null;
  dirtyPaths: string[];
}
export interface WorkspaceTreeNode {
  name: string;
  path?: string;
  children?: WorkspaceTreeNode[];
}

export const normalizeWorkspacePath = (path: string) =>
  path.replace(/\\/g, "/").replace(/^\.\//, "");

export function createWorkspace(
  name: string,
  input: WorkspaceFile[],
): LocalWorkspace {
  const files = Object.fromEntries(
    input.map((file) => {
      const path = normalizeWorkspacePath(file.path);
      return [path, { ...file, path }];
    }),
  );
  return {
    name,
    files,
    activePath: Object.keys(files).sort()[0] ?? null,
    dirtyPaths: [],
  };
}

export function editWorkspaceFile(
  ws: LocalWorkspace,
  path: string,
  source: string,
): LocalWorkspace {
  path = normalizeWorkspacePath(path);
  const file = ws.files[path];
  if (!file || file.source === source) return ws;
  return {
    ...ws,
    files: { ...ws.files, [path]: { path, source } },
    dirtyPaths: [...new Set([...ws.dirtyPaths, path])].sort(),
  };
}

export function selectWorkspaceFile(
  ws: LocalWorkspace,
  path: string,
): LocalWorkspace {
  path = normalizeWorkspacePath(path);
  return ws.files[path] ? { ...ws, activePath: path } : ws;
}

export function markWorkspaceSaved(
  ws: LocalWorkspace,
  paths: string[],
): LocalWorkspace {
  const saved = new Set(paths.map(normalizeWorkspacePath));
  return {
    ...ws,
    dirtyPaths: ws.dirtyPaths.filter((path) => !saved.has(path)),
  };
}

export function markWorkspaceSnapshotsSaved(
  ws: LocalWorkspace,
  snapshots: Record<string, string>,
): LocalWorkspace {
  const unchanged = Object.entries(snapshots)
    .filter(
      ([path, source]) =>
        ws.files[normalizeWorkspacePath(path)]?.source === source,
    )
    .map(([path]) => path);
  return markWorkspaceSaved(ws, unchanged);
}

export function workspaceTree(ws: LocalWorkspace): WorkspaceTreeNode[] {
  const root: WorkspaceTreeNode[] = [];
  for (const path of Object.keys(ws.files).sort()) {
    const parts = path.split("/");
    let level = root;
    parts.forEach((name, index) => {
      let node = level.find((item) => item.name === name);
      if (!node) {
        node =
          index === parts.length - 1 ? { name, path } : { name, children: [] };
        level.push(node);
      }
      level = node.children ?? [];
    });
  }
  const sort = (nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] =>
    nodes
      .sort(
        (a, b) =>
          Number(!a.children) - Number(!b.children) ||
          a.name.localeCompare(b.name),
      )
      .map((node) =>
        node.children ? { ...node, children: sort(node.children) } : node,
      );
  return sort(root);
}
