import { CulinaryEntityLink } from "../kitchen/CulinaryEntityLink";

export type KitchenDisplayTaskFactsProps = {
  taskId: string;
  title: string;
  status: string;
  owner: string | null;
  made: string | null;
  blockReason: string | null;
  componentId: string | null;
};

/** Who has the task, what is already made, why it is stuck, and the recipe. */
export function KitchenDisplayTaskFacts({
  taskId,
  title,
  status,
  owner,
  made,
  blockReason,
  componentId,
}: KitchenDisplayTaskFactsProps) {
  return (
    <>
      <p className="kds-detail">
        {owner ?? "Not claimed yet"}
        {made ? ` · ${made}` : ""}
      </p>
      {status === "blocked" ? (
        <p className="kds-detail">
          Blocked: {blockReason?.trim() || "no reason given"}
        </p>
      ) : null}
      {componentId ? (
        <CulinaryEntityLink
          kind="component"
          id={componentId}
          prepTaskId={taskId}
          className="kds-detail underline underline-offset-2"
        >
          Recipe: {title}
        </CulinaryEntityLink>
      ) : null}
    </>
  );
}
