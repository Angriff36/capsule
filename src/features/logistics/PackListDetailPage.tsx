import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { formatCountNoun } from "../../lib/format";
import {
  useCreatePackListItem,
  useGetPackList,
  useListDish,
  useListEvent,
  useListPackListItem,
  useListPackListTemplate,
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
import {
  BulkActionBar,
  useBulkRun,
  useBulkSelection,
} from "../../ui/bulk-select";
import { useRouteRecord } from "../../lib/routeRecord";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { useSlowQuery } from "../../ui/useSlowQuery";
import { ErrorState, StatusChip } from "../../ui/primitives";
import { classifyCommandFailure } from "../events/CommandFailure";
import { LogisticsFailureBanner } from "./LogisticsFailureBanner";
import { LogisticsLifecyclePolicy } from "./LogisticsLifecyclePolicy";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";
import { PackListItemForm } from "./PackListItemForm";
import { PackListItemTable } from "./PackListItemTable";
import { PACK_LIST_UNITS } from "./packListUnits";
import { useActionNotice } from "../../ui/action-result";

const policy = new LogisticsLifecyclePolicy();

// Generated list hooks return `any`; this summary type keeps template handling checked.
type TemplateSummary = {
  _id: string;
  name: string;
  items: string;
  status: string;
  serviceStyleId?: string | null;
  occasionId?: string | null;
  guestCountMin?: number | null;
  guestCountMax?: number | null;
  deletedAt?: number | null;
};

export function PackListDetailPage() {
  const { id } = useParams();
  const packList = useRouteRecord(useGetPackList, id);
  const items = useListPackListItem();
  const events = useListEvent();
  const dishes = useListDish();
  const createItem = useCreatePackListItem();
  const templates = useListPackListTemplate();
  const adjustQuantity = usePackListItemAdjustQuantity();
  const markItemPacked = usePackListItemMarkPacked();
  const markItemMissing = usePackListItemMarkMissing();
  const startPacking = usePackListStartPacking();
  const markPacked = usePackListMarkPacked();
  const markLoaded = usePackListMarkLoaded();
  const dispatch = usePackListDispatch();
  const cancel = usePackListCancel();
  const [showAdd, setShowAdd] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [failureItemId, setFailureItemId] = useState<string | null>(null);
  const { notice, setNotice } = useActionNotice();
  const { prompt, host } = useActionPrompt(busy != null);
  const { loadingTooLong } = useSlowQuery(packList);
  const bulk = useBulkRun();
  const packListId = packList ? packList._id : null;
  const itemBulkable = (item: { status: unknown }) =>
    policy
      .packItemActions(String(item.status))
      .some((a) => a.key === "markPacked" || a.key === "markMissing");
  const selectableItems = (items ?? []).filter(
    (item) =>
      item.deletedAt == null &&
      item.packListId === packListId &&
      itemBulkable(item),
  );
  const selection = useBulkSelection(selectableItems);

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
    setFailureItemId(null);
    setNotice(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
      // Item run keys are `${itemId}:${action}` — remember the row so the
      // error can render next to it, not only in the page-top banner (#118).
      setFailureItemId(
        key.includes(":") ? key.slice(0, key.indexOf(":")) : null,
      );
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

  const event = events?.find((e) => e._id === packList.eventId);

  const parseTemplateItems = (
    raw: string | null | undefined,
  ): { description: string; requiredQuantity: number; unit: string }[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (
            it,
          ): it is {
            description: string;
            requiredQuantity: number;
            unit: string;
          } =>
            typeof it === "object" &&
            it !== null &&
            typeof (it as { description: unknown }).description === "string" &&
            typeof (it as { requiredQuantity: unknown }).requiredQuantity ===
              "number",
        )
        .map((it) => ({
          description: it.description,
          requiredQuantity: it.requiredQuantity,
          unit: PACK_LIST_UNITS.includes(
            it.unit as (typeof PACK_LIST_UNITS)[number],
          )
            ? it.unit
            : "each",
        }));
    } catch {
      return [];
    }
  };

  // A template "matches" the event when every dimension it scopes is satisfied
  // (null dimension = unconstrained). Used only to badge suggestions; the
  // operator may still pick any active template.
  const matchesEvent = (template: TemplateSummary): boolean => {
    if (!event) return false;
    const styleOk =
      template.serviceStyleId == null ||
      template.serviceStyleId === event.serviceStyleId;
    const occasionOk =
      template.occasionId == null || template.occasionId === event.occasionId;
    const head = event.expectedHeadcount ?? 0;
    const minOk =
      template.guestCountMin == null || head >= template.guestCountMin;
    const maxOk =
      template.guestCountMax == null || head <= template.guestCountMax;
    return styleOk && occasionOk && minOk && maxOk;
  };

  const generateFromTemplate = (template: TemplateSummary) => {
    void run(`generate:${template._id}`, async () => {
      const lines = parseTemplateItems(template.items).filter(
        (it) => it.description.trim() !== "" && it.requiredQuantity > 0,
      );
      if (lines.length === 0) {
        throw new Error("This template has no valid items to generate.");
      }
      // ponytail: sequential client-side copy (non-atomic). A mid-loop network
      // drop can leave a partial load sheet; a server-side bulk-generate action
      // is the upgrade path if it bites. Mirrors VenueLayoutTemplate's copy.
      for (const it of lines) {
        await createItem({
          packListId: packList._id,
          description: it.description,
          requiredQuantity: it.requiredQuantity,
          unit: it.unit,
        });
      }
      setShowTemplates(false);
      setNotice(
        `${lines.length} ${lines.length === 1 ? "item" : "items"} generated from "${template.name}".`,
      );
    });
  };

  const activeTemplates = (templates ?? [])
    .filter(
      (t: TemplateSummary) =>
        t.deletedAt == null && String(t.status) === "active",
    )
    .sort(
      (a: TemplateSummary, b: TemplateSummary) =>
        Number(matchesEvent(b)) - Number(matchesEvent(a)) ||
        a.name.localeCompare(b.name),
    );

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

  const itemCanPack = (item: { status: unknown }) =>
    policy
      .packItemActions(String(item.status))
      .some((a) => a.key === "markPacked");
  const itemCanMiss = (item: { status: unknown }) =>
    policy
      .packItemActions(String(item.status))
      .some((a) => a.key === "markMissing");

  const runBulkPack = () => {
    const targets = selection.selected.filter(itemCanPack);
    if (targets.length === 0) return;
    void run("bulk-pack", async () => {
      await bulk.runBulk(targets, async (item) => {
        await markItemPacked({
          docId: item._id,
          version: item.version,
          packedQuantity: item.requiredQuantity,
        });
      });
      selection.clear();
      setNotice(
        `${targets.length} ${targets.length === 1 ? "item" : "items"} marked packed.`,
      );
    });
  };

  const runBulkMissing = () => {
    const targets = selection.selected.filter(itemCanMiss);
    if (targets.length === 0) return;
    void run("bulk-missing", async () => {
      await bulk.runBulk(targets, async (item) => {
        await markItemMissing({ docId: item._id, version: item.version });
      });
      selection.clear();
      setNotice(
        `${targets.length} ${targets.length === 1 ? "item" : "items"} marked missing.`,
      );
    });
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
            <>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  setShowAdd((value) => !value);
                  setShowTemplates(false);
                }}
              >
                {showAdd ? "Close form" : "Add item"}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setShowTemplates((value) => !value);
                  setShowAdd(false);
                }}
              >
                {showTemplates ? "Close templates" : "From template"}
              </button>
            </>
          ) : null}
        </div>
      </header>
      <LogisticsWorkspaceNav />
      {failure ? <LogisticsFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
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

      {showTemplates && canAddItems ? (
        <section className="mt-3 rounded-sm border border-line-2 bg-panel p-3">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Generate from a template</p>
            <Link
              className="text-link text-base"
              to="/logistics/pack-templates"
            >
              Manage templates
            </Link>
          </div>
          {activeTemplates.length === 0 ? (
            <p className="mt-2 text-base text-ink-3">
              No active pack list templates yet.{" "}
              <Link className="link" to="/logistics/pack-templates">
                Create one
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {activeTemplates.map((template) => {
                const count = parseTemplateItems(template.items).length;
                const suggested = matchesEvent(template);
                return (
                  <li
                    key={template._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line-2 p-2"
                  >
                    <div>
                      <span className="font-medium text-ink">
                        {template.name}
                      </span>
                      {suggested ? (
                        <span className="ml-2 rounded-full border border-ok/30 bg-ok-soft px-2 py-0.5 text-xs text-ok">
                          Suggested for this event
                        </span>
                      ) : null}
                      <span className="ml-2 text-sm text-ink-3">
                        {count} {count === 1 ? "item" : "items"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy != null}
                      onClick={() => generateFromTemplate(template)}
                    >
                      {busy === `generate:${template._id}`
                        ? "Generating…"
                        : "Generate"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Ruled load sheet</p>
            <h2>Pack items</h2>
          </div>
          <span>{formatCountNoun(listItems.length, "item")}</span>
        </div>
        <PackListItemTable
          loading={items === undefined || events === undefined}
          items={listItems}
          canAddItems={canAddItems}
          busy={busy}
          dishName={dishName}
          itemActions={(status) => policy.packItemActions(status)}
          failedItem={
            failureItemId && failure
              ? {
                  id: failureItemId,
                  message: classifyCommandFailure(failure).title,
                }
              : null
          }
          onAdd={() => setShowAdd(true)}
          onInvokeItem={(item, key) => void invokeItem(item, key)}
          canSelectItem={itemBulkable}
          isItemSelected={selection.isSelected}
          allSelected={selection.allSelected}
          onToggleItem={selection.toggle}
          onToggleAll={selection.toggleAll}
          selectableCount={selectableItems.length}
        />
      </section>

      <BulkActionBar
        count={selection.count}
        noun="item"
        progress={bulk.progress}
        onClear={selection.clear}
      >
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={
            busy != null || selection.selected.filter(itemCanPack).length === 0
          }
          onClick={runBulkPack}
        >
          Mark packed ({selection.selected.filter(itemCanPack).length})
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={
            busy != null || selection.selected.filter(itemCanMiss).length === 0
          }
          onClick={runBulkMissing}
        >
          Mark missing ({selection.selected.filter(itemCanMiss).length})
        </button>
      </BulkActionBar>
    </div>
  );
}
