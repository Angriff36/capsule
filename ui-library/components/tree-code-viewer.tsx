import {
  TreeExpander,
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
} from "./tree-code-viewer-tree";
import {
  type TreeNodeData,
  buildSimpleTree,
  getFileIcon,
} from "./tree-code-viewer-structure";
import { useState } from "react";
import { ClientPreCode, highlight } from "./code-block";

export function TreeCodeViewer({
  files,
}: {
  files: {
    id: string;
    fileName: string;
    virtualPath: string[];
    ext: string;
    raw: string;
    html: string;
  }[];
}) {
  const tree = buildSimpleTree(files);
  const [selectedId, setSelectedId] = useState(files[0]?.id);
  const fileMap = Object.fromEntries(files.map((f) => [f.id, f]));
  const selectedFile = selectedId ? fileMap[selectedId] : null;

  return (
    <div className="grid grid-cols-[250px_1fr] border dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 overflow-hidden">
      {/* LEFT */}
      <TreeProvider
        selectable
        multiSelect={false}
        defaultExpandedIds={[tree[0].name, "ui", "lib"]}
        onSelectionChange={(ids) => {
          if (ids[0]) setSelectedId(ids[0]);
        }}
        className="border-r dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900"
      >
        <TreeView>
          <RenderTree nodes={tree} />
        </TreeView>
      </TreeProvider>

      {/* RIGHT */}
      <div className="min-w-0 p-2">
        {selectedFile ? (
          <ClientPreCode html={selectedFile.html} raw={selectedFile.raw} />
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Select a file</div>
        )}
      </div>
    </div>
  );
}

function RenderTree({
  nodes,
  level = 0,
}: {
  nodes: TreeNodeData[];
  level?: number;
}) {
  return (
    <>
      {nodes.map((node, index) => {
        const isLast = index === nodes.length - 1;

        // 📁 FOLDER
        if (node.type === "folder") {
          return (
            <TreeNode
              key={node.name}
              nodeId={node.name}
              level={level}
              isLast={isLast}
              isFolder
            >
              <TreeNodeTrigger>
                <TreeExpander hasChildren />
                <TreeIcon icon={getFileIcon("folder")} />
                <TreeLabel>{node.name}</TreeLabel>
              </TreeNodeTrigger>

              <TreeNodeContent hasChildren>
                <RenderTree nodes={node.children} level={level + 1} />
              </TreeNodeContent>
            </TreeNode>
          );
        }

        // 📄 FILE
        return (
          <TreeNode
            key={node.id}
            nodeId={node.id}
            level={level}
            isLast={isLast}
          >
            <TreeNodeTrigger>
              <TreeExpander />
              <TreeIcon icon={getFileIcon("file", node.ext, node.name)} />
              <TreeLabel>{node.name}</TreeLabel>
            </TreeNodeTrigger>
          </TreeNode>
        );
      })}
    </>
  );
}

export type TransformedCodeFile = {
  id: string;
  fileName: string;
  virtualPath: string[];
  ext: string;
  raw: string;
  html: string;
};

export type SourceFile = { fileName: string; fileSrc: string; pathSrc: string };

const VIRTUAL_LIB_FILE = {
  fileName: "utils.tsx",
  folder: "lib",
  ext: "tsx",
  raw: `
import { ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`.trim(),
};

const VIRTUAL_PACKAGE_JSON = {
  fileName: "package.json",
  ext: "json",
  raw: JSON.stringify(
    {
      name: "ui-layouts",
      private: true,
      dependencies: {
        next: "15.x",
        react: "19.x",
        "react-dom": "19.x",
        tailwindcss: "^4",
        "tailwind-merge": "^2",
        clsx: "^2",
        motion: "^12",
        "lucide-react": "^0.4",
        "@radix-ui/react-dialog": "^1",
        "@radix-ui/react-tabs": "^1",
      },
    },
    null,
    2,
  ),
};

function resolveVirtualPath(pathSrc: string, blockId: string): string[] {
  if (pathSrc.includes("/hero-section/") || pathSrc.includes("/blocks/src/")) {
    return [blockId];
  }
  if (pathSrc.includes("/hooks/")) return ["hooks"];
  if (pathSrc.includes("/components/ui/")) return ["ui"];
  if (pathSrc.includes("/components/")) return ["components"];
  if (pathSrc.includes("/lib/")) return ["lib"];
  return ["ui"];
}

/** Highlights each source file and adds the virtual lib/utils.tsx and package.json, like ui-layouts. */
export async function transformCodeFiles(
  sources: SourceFile[],
  blockId: string,
): Promise<TransformedCodeFile[]> {
  const files: TransformedCodeFile[] = [];

  for (const { fileName, fileSrc, pathSrc } of sources) {
    const ext = fileName.split(".").pop() || "txt";
    const virtualPath = resolveVirtualPath(pathSrc, blockId);
    files.push({
      id: `${virtualPath.join("/")}/${fileName}`,
      fileName,
      virtualPath,
      ext,
      raw: fileSrc,
      html: await highlight(fileSrc, ext),
    });
  }

  files.push({
    id: `lib/${VIRTUAL_LIB_FILE.fileName}`,
    fileName: VIRTUAL_LIB_FILE.fileName,
    virtualPath: ["lib"],
    ext: VIRTUAL_LIB_FILE.ext,
    raw: VIRTUAL_LIB_FILE.raw,
    html: await highlight(VIRTUAL_LIB_FILE.raw, VIRTUAL_LIB_FILE.ext),
  });

  files.push({
    id: "package.json",
    fileName: "package.json",
    virtualPath: [],
    ext: "json",
    raw: VIRTUAL_PACKAGE_JSON.raw,
    html: await highlight(VIRTUAL_PACKAGE_JSON.raw, "json"),
  });

  return files;
}
