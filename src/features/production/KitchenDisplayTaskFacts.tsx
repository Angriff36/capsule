import { CulinaryEntityLink } from "../kitchen/CulinaryEntityLink";

export type KitchenDisplayTaskFactsProps = {
  taskId: string;
  title: string;
  status: string;
  owner: string | null;
  made: string | null;
  blockReason: string | null;
  componentId: string | null;
  dishId: string | null;
  instructions: string | null;
};

/** Who has the task, what is already made, why it is stuck, and the method. */
export function KitchenDisplayTaskFacts({
  taskId,
  title,
  status,
  owner,
  made,
  blockReason,
  componentId,
  dishId,
  instructions,
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
      {instructions?.trim() ? (
        <p className="kds-detail">{instructions.trim()}</p>
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
      ) : dishId ? (
        <CulinaryEntityLink
          kind="dish"
          id={dishId}
          className="kds-detail underline underline-offset-2"
        >
          Steps for this dish
        </CulinaryEntityLink>
      ) : null}
    </>
  );
}
