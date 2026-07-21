import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useCreatePackListItem,
  useGetPackList,
  useListDish,
  useListEvent,
  useListPackListItem,
  usePackListCancel,
  usePackListDispatch,
  usePackListItemAdjustQuantity,
  usePackListItemMarkMissing,
  usePackListItemMarkPacked,
  usePackListMarkLoaded,
  usePackListMarkPacked,
  usePackListStartPacking,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { useSlowQuery } from "../../ui/useSlowQuery";
import { ErrorState, StatusChip } from "../../ui/primitives";
import { LogisticsFailureBanner } from "./LogisticsFailureBanner";
import { LogisticsLifecyclePolicy } from "./LogisticsLifecyclePolicy";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";
import { PackListItemForm } from "./PackListItemForm";
import { PackListItemTable } from "./PackListItemTable";

const policy = new LogisticsLifecyclePolicy();

export function PackListDetailPage() {
  const { id } = useParams();
  const packList = useGetPackList(id || "skip");
  const items = useListPackListItem();
  const events = useListEvent();
  const dishes = useListDish();
  const createItem = useCreatePackListItem();
  const adjustQuantity = usePackListItemAdjustQuantity();
  const markItemPacked = usePackListItemMarkPacked();
  const markItemMissing = usePackListItemMarkMissing();
  const startPacking = usePackListStartPacking();
  const markPacked = usePackListMarkPacked();
  const markLoaded = usePackListMarkLoaded();
  const dispatch = usePackListDispatch();
  const cancel = usePackListCancel();
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);
  const { loadingTooLong } = useSlowQuery(packList);

  if (!id) {
    return (
      <ErrorState
        title="Pack list not found"
        detail="No pack list id was provided."
      />
    );
  }
  if (packList === undefined) {
    return (
      <div className="operations-stage supply-stage order-folio">
        <Link className="text-link" to="/logistics/packs">
          ← Pack lists
        </Link>
        <LogisticsWorkspaceNav />
        <QueryLoadState
          title="Pack list data is not loading"
          detail="The workspace did not return this pack list. Check the session or backend connection, then retry."
          loadingTooLong={loadingTooLong}
        />
      </div>
    );
  }
  if (packList === null) {
    return (
      <ErrorState
        title="Pack list not found"
        detail="This pack list is unavailable in the current workspace."
        onRetry={() => window.location.reload()}
      />
    );
  }

  const listItems = (items ?? []).filter(
    (item) => item.deletedAt == null && item.packListId === packList._id,
  );
  const eventTitle =
    events?.find((event) => event._id === packList.eventId)?.title ??
    "Unknown event";
  const dishName = (dishId?: string | null) =>
    dishId
      ? (dishes?.find((dish) => dish._id === dishId)?.name ?? "Unknown dish")
      : null;
  const canAddItems =
    String(packList.status) === "draft" ||
    String(packList.status) === "packing";

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("add-item", async () => {
      await createItem({
        packListId: packList._id,
        description: String(data.get("description") || "").trim(),
        requiredQuantity: Number(data.get("requiredQuantity")),
        unit: String(data.get("unit") || "each"),
        dishId: String(data.get("dishId") || "") || undefined,
      });
      form.reset();
      setShowAdd(false);
      setNotice("Item added to the load sheet.");
    });
  };

  const invokeList = (key: string) => {
    void (async () => {
      if (key === "cancel") {
        const reason = await prompt.askReason({
          ...ReasonCopy.cancelPackList,
          tone: "danger",
        });
        if (!reason) return;
        void run(`list:${key}`, async () => {
          await cancel({
            docId: packList._id,
            version: packList.version,
            reason,
          });
          setNotice("Pack list cancelled.");
        });
        return;
      }
      void run(`list:${key}`, async () => {
        const args = { docId: packList._id, version: packList.version };
        if (key === "startPacking") await startPacking(args);
        if (key === "markPacked") await markPacked(args);
        if (key === "markLoaded") await markLoaded(args);
        if (key === "dispatch") await dispatch(args);
        setNotice(`Pack list updated (${key}).`);
      });
    })();
  };

  const invokeItem = async (
    item: {
      _id: string;
      version: number;
      requiredQuantity: number;
      status: unknown;
    },
    key: string,
  ) => {
    if (key === "markPacked") {
      const values = await prompt.askFields({
        title: "Mark item packed",
        description: "Enter the packed quantity for this load-sheet line.",
        confirmLabel: "Mark packed",
        fields: [
          {
            name: "packedQuantity",
            label: "Packed quantity",
            inputType: "number",
            required: true,
            defaultValue: String(item.requiredQuantity),
          },
        ],
      });
      if (!values) return;
      void run(`${item._id}:${key}`, async () => {
        await markItemPacked({
          docId: item._id,
          version: item.version,
          packedQuantity: Number(values.packedQuantity),
        });
        setNotice("Item marked packed.");
      });
      return;
    }
    if (key === "markMissing") {
      void run(`${item._id}:${key}`, async () => {
        await markItemMissing({ docId: item._id, version: item.version });
        setNotice("Item marked missing — resolve it in its owning system.");
      });
      return;
    }
    if (key === "adjust") {
      const values = await prompt.askFields({
        title: "Adjust required quantity",
        description: "Update the required quantity for this listed item.",
        confirmLabel: "Adjust",
        fields: [
          {
            name: "requiredQuantity",
            label: "Required quantity",
            inputType: "number",
            required: true,
            defaultValue: String(item.requiredQuantity),
          },
        ],
      });
      if (!values) return;
      void run(`${item._id}:adjust`, async () => {
        await adjustQuantity({
          docId: item._id,
          version: item.version,
          requiredQuantity: Number(values.requiredQuantity),
        });
        setNotice("Required quantity adjusted.");
      });
    }
  };

  return (
    <div className="operations-stage supply-stage order-folio">
      <Link className="text-link" to="/logistics/packs">
        ← Pack lists
      </Link>
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Load sheet</p>
          <h1 className="display-title mt-2">{packList.name || "Pack list"}</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            {eventTitle}
            {packList.purpose ? ` · ${packList.purpose}` : ""}
          </p>
        </div>
        <div className="supply-row-actions">
          <StatusChip status={String(packList.status)} />
          {policy.packListActions(String(packList.status)).map((action) => (
            <button
              key={action.key}
              className="btn btn-ghost"
              disabled={busy != null}
              onClick={() => invokeList(action.key)}
            >
              {busy === `list:${action.key}` ? "Working…" : action.label}
            </button>
          ))}
          {canAddItems ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setShowAdd((value) => !value)}
            >
              {showAdd ? "Close form" : "Add item"}
            </button>
          ) : null}
        </div>
      </header>
      <LogisticsWorkspaceNav />
      {failure ? <LogisticsFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-[13px] text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      {showAdd && canAddItems ? (
        <PackListItemForm
          dishes={dishes ?? []}
          busy={busy === "add-item"}
          onSubmit={submitItem}
        />
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Ruled load sheet</p>
            <h2>Pack items</h2>
          </div>
          <span>{listItems.length} items</span>
        </div>
        <PackListItemTable
          loading={items === undefined || events === undefined}
          items={listItems}
          canAddItems={canAddItems}
          busy={busy}
          dishName={dishName}
          itemActions={(status) => policy.packItemActions(status)}
          onAdd={() => setShowAdd(true)}
          onInvokeItem={(item, key) => void invokeItem(item, key)}
        />
      </section>
    </div>
  );
}
