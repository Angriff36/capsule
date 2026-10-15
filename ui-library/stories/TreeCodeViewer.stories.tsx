import type { Meta, StoryObj } from "@storybook/react-vite";
import { libraryFrame } from "../LibraryFrame";
import { useEffect, useState } from "react";
import {
  TreeCodeViewer,
  type TransformedCodeFile,
  transformCodeFiles,
} from "../components/tree-code-viewer";
import { sampleFileData } from "../components/tree-code-viewer-data";

const meta: Meta = {
  title: "UI Layouts Library/Code/Tree Code Viewer",
  decorators: [libraryFrame],
  parameters: {
    docs: {
      description: {
        component:
          "ui-layouts Tree Code Viewer (https://ui-layouts.com/components/tree-code-viewer): a file tree on the left and the highlighted source of the selected file on the right.",
      },
    },
  },
};
export default meta;
type Story = StoryObj;

function Demo() {
  const [files, setFiles] = useState<TransformedCodeFile[]>([]);

  useEffect(() => {
    transformCodeFiles(sampleFileData, "tree-code-viewer").then(setFiles);
  }, []);

  if (files.length === 0) {
    return (
      <div className="p-6 w-full mx-auto h-[400px] bg-muted animate-pulse"></div>
    );
  }

  return (
    <div className="p-6 w-full mx-auto bg-background rounded">
      <TreeCodeViewer files={files} />
    </div>
  );
}

export const Default: Story = { render: () => <Demo /> };
