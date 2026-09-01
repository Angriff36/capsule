import { useRef, useState, type DragEvent } from "react";

function dragHasFiles(event: DragEvent<HTMLElement>): boolean {
  return event.dataTransfer.types.includes("Files");
}

/**
 * Drag-and-drop files onto an element. `dragActive` drives the dashed
 * outline; the depth counter survives enter/leave pairs on child nodes.
 */
export function useChatDropzone(onFiles: (files: FileList) => void) {
  const depthRef = useRef(0);
  const [dragActive, setDragActive] = useState(false);

  const onDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    depthRef.current += 1;
    setDragActive(true);
  };
  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (dragHasFiles(event)) event.preventDefault();
  };
  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) return;
    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) setDragActive(false);
  };
  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!dragHasFiles(event)) return;
    event.preventDefault();
    depthRef.current = 0;
    setDragActive(false);
    onFiles(event.dataTransfer.files);
  };

  return {
    dragActive,
    dropHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
