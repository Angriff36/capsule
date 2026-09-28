import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { formatCountNoun } from "../../lib/format";
import {
  useCreatePackListItem,
  useGetPackList,
  useListDish,
  useListEvent,
  useListPerson,
  useListPackListItem,
  useListPackListTemplate,
  usePackListCancel,
  usePackListDispatch,
  usePackListItemAdjustQuantity,
  usePackListItemAnnotate,
  usePackListItemRemove,
  usePackListApplyServiceStyleKit,
  usePackListRequestAssistance,
  usePackListResolveAssistance,
  useListServiceStyle,
  useListServiceStyleKitItem,
  usePackListItemMarkMissing,
  usePackListItemMarkPacked,
  usePackListItemRecordPackedCount,
  usePackListItemRecordSentInstead,
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
import { PackListKitAssistBar } from "./PackListKitAssistBar";
import { PACK_LIST_UNITS } from "./packListUnits";
import { useActionNotice } from "../../ui/action-result";
import { useApplyPackTemplate } from "../../lib/safeMaterialization";
import {
  beginPendingOperation,
  confirmPendingOperation,
} from "../../lib/pendingOperationKey";

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
  const people = useListPerson();
  const createItem = useCreatePackListItem();
  const applyPackTemplate = useApplyPackTemplate();
  const templates = useListPackListTemplate();
  const adjustQuantity = usePackListItemAdjustQuantity();
  const annotateItem = usePackListItemAnnotate();
  const removeItem = usePackListItemRemove();
  const applyKit = usePackListApplyServiceStyleKit();
  const requestAssistance = usePackListRequestAssistance();
  const resolveAssistance = usePackListResolveAssistance();
  const serviceStyles = useListServiceStyle();
  const kitItems = useListServiceStyleKitItem();
  const markItemPacked = usePackListItemMarkPacked();
  const recordPackedCount = usePackListItemRecordPackedCount();
  const recordSentInstead = usePackListItemRecordSentInstead();
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
      ? (dishes?.find((dish) => dish._id === dishId && dish.deletedAt == null)
          ?.name ?? null)
      : null;
  const packedByName = (personId?: string | null) => {
    if (!personId) return null;
    const person = people?.find(
      (row) => row._id === personId && row.deletedAt == null,
    );
    if (!person) return people ? "A teammate" : null;
    const name = `${person.givenName} ${person.familyName}`.trim();
    return name || "A teammate";
  };
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
  const serviceStyle = event?.serviceStyleId
    ? serviceStyles?.find(
        (style) =>
          style._id === event.serviceStyleId && style.deletedAt == null,
      )
    : undefined;
  const kitLineCount = (kitItems ?? []).filter(
    (line) =>
      line.deletedAt == null &&
      String(line.status) === "active" &&
      line.serviceStyleId === serviceStyle?._id,
  ).length;
  const listIsLive =
    String(packList.status) !== "dispatched" &&
    String(packList.status) !== "cancelled";

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
      const scope = `pack-template:${packList._id}:${template._id}`;
      const pending = beginPendingOperation(scope, {
        packListId: packList._id,
        items: lines,
      });
      const result = await applyPackTemplate({
        ...pending.payload,
        operationKey: pending.key,
      });
      confirmPendingOperation(scope);
      setShowTemplates(false);
      setNotice(
        result.recovered
          ? `${result.itemCount} ${result.itemCount === 1 ? "item was" : "items were"} already saved from "${template.name}"; the earlier result was recovered.`
          : `${pending.payload.items.length} ${pending.payload.items.length === 1 ? "item" : "items"} generated from "${template.name}".`,
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
      if (key === "markPacked") {
        // #377 part 3: same zero-packed warn as the lists page. While the
        // line rows are still loading the counts are unknown, so ask anyway
        // — skipping then would let an unresolved query bypass the check.
        const packedCount = listItems.filter(
          (item) => String(item.status) === "packed",
        ).length;
        if (
          items === undefined ||
          (listItems.length > 0 && packedCount === 0)
        ) {
          const proceed = await prompt.askConfirm({
            title: "No lines packed yet",
            description:
              items === undefined
                ? "Line details are still loading, so packed counts are not known yet. If this list has lines and none are packed, marking it packed now would close it blind. Mark the list packed anyway?"
                : `This list has ${formatCountNoun(listItems.length, "line")} and none are marked packed. Mark the list packed anyway?`,
            confirmLabel: "Mark packed anyway",
            cancelLabel: "Go back",
            tone: "danger",
          });
          if (!proceed) return;
        }
      }
      void run(`list:${key}`, async () => {
        const args = { docId: packList._id, version: packList.version };
        if (key === "startPacking") {
          await startPacking(args);
          setNotice("Packing started.");
        }
        if (key === "markPacked") {
          await markPacked(args);
          setNotice("Pack list marked packed.");
        }
        if (key === "markLoaded") {
          await markLoaded(args);
          setNotice("Pack list marked loaded.");
        }
        if (key === "dispatch") {
          await dispatch(args);
          setNotice("Pack list dispatched.");
        }
      });
    })();
  };

  /**
   * Item-level packed/missing need the list past DRAFT (PackListItem guards
   * on packList.status). Ticking the first item is a perfectly clear "we've
   * started", so start the list instead of throwing a server error (#142).
   * Returns a suffix for the notice so the operator sees the list moved.
   */
  const ensurePacking = async (): Promise<string> => {
    if (String(packList.status) !== "draft") return "";
    await startPacking({ docId: packList._id, version: packList.version });
    return " Packing started on this list.";
  };

  const invokeItem = async (
    item: {
      _id: string;
      version: number;
      requiredQuantity: number;
      packedQuantity: number;
      status: unknown;
      note?: string | null;
      sentInstead?: string | null;
    },
    key: string,
  ) => {
    if (key === "sentInstead") {
      const values = await prompt.askFields({
        title: "Sent instead",
        description:
          "If a different item went out, say what it was. The listed item stays. Leave this empty to clear it.",
        confirmLabel: "Save",
        fields: [
          {
            name: "sentInstead",
            label: "What went out",
            inputType: "text",
            required: false,
            defaultValue: item.sentInstead ?? "",
          },
        ],
      });
      if (!values) return;
      const sentInstead = values.sentInstead?.trim() || undefined;
      void run(`${item._id}:sentInstead`, async () => {
        await recordSentInstead({
          docId: item._id,
          version: item.version,
          sentInstead,
        });
        setNotice(
          sentInstead
            ? "Saved what went out instead."
            : "Cleared what went out instead.",
        );
      });
      return;
    }
    if (key === "note") {
      const values = await prompt.askFields({
        title: "Packer note",
        description:
          "What the packer needs to know for this line, such as the servingware type. Leave it empty to clear the note.",
        confirmLabel: "Save note",
        fields: [
          {
            name: "note",
            label: "Note",
            inputType: "text",
            required: false,
            defaultValue: item.note ?? "",
          },
        ],
      });
      if (!values) return;
      void run(`${item._id}:note`, async () => {
        await annotateItem({
          docId: item._id,
          version: item.version,
          note: values.note?.trim() || undefined,
        });
        setNotice("Note saved.");
      });
      return;
    }
    if (key === "remove") {
      void run(`${item._id}:remove`, async () => {
        await removeItem({ docId: item._id, version: item.version });
        setNotice("Line removed from this event's list.");
      });
      return;
    }
    if (key === "markPacked") {
      const alreadyPacked = Number(item.packedQuantity ?? 0);
      const required = Number(item.requiredQuantity);
      const values = await prompt.askFields({
        title:
          alreadyPacked > 0 ? "Update packed quantity" : "Mark item packed",
        description:
          "Enter the total packed so far. A short count stays on the list until the rest is packed.",
        confirmLabel: "Save packed quantity",
        fields: [
          {
            name: "packedQuantity",
            label: "Total packed so far",
            inputType: "number",
            required: true,
            defaultValue: String(
              alreadyPacked > 0 ? alreadyPacked : item.requiredQuantity,
            ),
          },
        ],
      });
      if (!values) return;
      const packedQuantity = Number(values.packedQuantity);
      void run(`${item._id}:${key}`, async () => {
        const started = await ensurePacking();
        const save =
          packedQuantity < required ? recordPackedCount : markItemPacked;
        await save({
          docId: item._id,
          version: item.version,
          packedQuantity,
        });
        setNotice(
          packedQuantity < required
            ? `Packed ${packedQuantity} of ${required} so far. This line stays open until the rest is packed.${started}`
            : `Item marked packed.${started}`,
        );
      });
      return;
    }
    if (key === "markMissing") {
      void run(`${item._id}:${key}`, async () => {
        const started = await ensurePacking();
        await markItemMissing({ docId: item._id, version: item.version });
        setNotice(
          `Item marked missing. Fix it wherever this item is tracked.${started}`,
        );
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
      await ensurePacking();
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
      await ensurePacking();
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
      {listIsLive ? (
        <PackListKitAssistBar
          serviceStyleName={serviceStyle?.name ?? null}
          kitLineCount={kitLineCount}
          assistanceRequestedAt={packList.assistanceRequestedAt}
          assistanceNote={packList.assistanceNote}
          busy={busy}
          onApplyKit={() =>
            void run("list:applyKit", async () => {
              if (!serviceStyle) return;
              await applyKit({
                docId: packList._id,
                version: packList.version,
                serviceStyleId: serviceStyle._id,
              });
              setNotice("Style kit lines added.");
            })
          }
          onRequestAssistance={() =>
            void (async () => {
              const values = await prompt.askFields({
                title: "Needs assistance",
                description:
                  "The Event Tracker shows this list as Needs assistance until someone resolves it.",
                confirmLabel: "Ask for help",
                fields: [
                  {
                    name: "note",
                    label: "What is the problem",
                    inputType: "text",
                    required: false,
                  },
                ],
              });
              if (!values) return;
              void run("list:requestAssistance", async () => {
                await requestAssistance({
                  docId: packList._id,
                  version: packList.version,
                  note: values.note?.trim() || undefined,
                });
                setNotice("The tracker now shows Needs assistance.");
              });
            })()
          }
          onResolveAssistance={() =>
            void run("list:resolveAssistance", async () => {
              await resolveAssistance({
                docId: packList._id,
                version: packList.version,
              });
              setNotice("Assistance resolved.");
            })
          }
        />
      ) : null}

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
          loading={
            items === undefined || events === undefined || dishes === undefined
          }
          items={listItems}
          canAddItems={canAddItems}
          canEditLines={listIsLive}
          busy={busy}
          dishName={dishName}
          packedByName={packedByName}
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
