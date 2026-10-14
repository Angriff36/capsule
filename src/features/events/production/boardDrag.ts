import type { DragEvent } from "react";

/** What is being dragged on the production board. */
export type BoardDrag = {
  kind: "section" | "crew" | "vehicle" | "trailer" | "gear";
  id: string;
};

const TYPE = "application/x-capsule-board";

export function dragPayload(event: DragEvent, payload: BoardDrag) {
  event.dataTransfer.setData(TYPE, JSON.stringify(payload));
  event.dataTransfer.effectAllowed = "move";
}

export function readDrag(event: DragEvent): BoardDrag | null {
  try {
    const raw = event.dataTransfer.getData(TYPE);
    return raw ? (JSON.parse(raw) as BoardDrag) : null;
  } catch {
    return null;
  }
}

/** Runs one change and reports it; returns once the change is saved or failed. */
export type Saver = (
  label: string,
  work: () => Promise<unknown>,
) => Promise<void>;
