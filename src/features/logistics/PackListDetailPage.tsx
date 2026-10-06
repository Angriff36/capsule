import { packListName } from "./packListName";
import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ReturnToListLink } from "../list-state/listOrigin";
import { formatCountNoun } from "../../lib/format";
import {
  useCreatePackListItem,
  useGetPackList,
  useListPerson,
  useListPackListItem,
  useListPackListTemplate,
  usePackListCancel,
  usePackListDispatch,
  usePackListItemAdjustQuantity,
  usePackListItemAnnotate,
  usePackListItemSetBin,
  usePackListItemAssignLoad,
  usePackListItemSetUnitVolume,
  usePackListItemSetUnitWeight,
  usePackListItemExclude,
  usePackListItemRemove,
  usePackListItemRestoreExcluded,
  usePackListApplyServiceStyleKit,
  usePackListRequestAssistance,
  usePackListResolveAssistance,
  useListServiceStyle,
  useListServiceStyleKitItem,
  usePackListItemMarkMissing,
  usePackListItemMarkPacked,
  usePackListItemRecordChecked,
  useListPackSectionClaim,
  usePackSectionClaimRelease,
  usePackListItemRecordLoaded,
  usePackListItemRecordPackedCount,
  usePackListItemRecordReturn,
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
import { useAuthStatus } from "../../lib/useAuthStatus";
import { usePackSectionTake } from "../../lib/usePackSectionTake";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { useSlowQuery } from "../../ui/useSlowQuery";
import { ErrorState, StatusChip } from "../../ui/primitives";
import { classifyCommandFailure } from "../events/CommandFailure";
import { useEventsById } from "../facilities/useEventsById";
import { useDishesByIds, useWholeDishList } from "../../lib/useDishesByIds";
import { LogisticsFailureBanner } from "./LogisticsFailureBanner";
import { LogisticsLifecyclePolicy } from "./LogisticsLifecyclePolicy";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";
import { PackListItemForm } from "./PackListItemForm";
import { PackListViews } from "./PackListViews";
import { PACK_VIEWS, type PackViewKind } from "./packViews";
import { usePackRigs } from "./usePackRigs";
import { useEventTransport } from "../../lib/useEventRouteLegs";
import { PackListKitAssistBar } from "./PackListKitAssistBar";
import { PackScanPanel } from "./PackScanPanel";
import { PackFoodPackaging } from "./PackFoodPackaging";
import { PackBinSheet } from "./PackBinSheet";
import { PackListSourcePanel } from "./PackListSourcePanel";
import { packWentOut } from "./packReturn";
import { PACK_LIST_UNITS } from "./packListUnits";
import { useActionNotice } from "../../ui/action-result";
import {
  useApplyPackTemplate,
  useRefreshPackRules,
} from "../../lib/safeMaterialization";
import { PackReadinessNotice } from "./PackReadinessNotice";
import { PackTemplatePreview } from "./PackTemplatePreview";
import {
  parseTemplateLines,
  previewTemplateApplication,
} from "../../lib/packTemplateLines";
import {
  beginPendingOperation,
  confirmPendingOperation,
} from "../../lib/pendingOperationKey";

const policy = new LogisticsLifecyclePolicy();

// Generated list hooks return `any`; this summary type keeps template handling checked.
type TemplateId = NonNullable<
  Parameters<ReturnType<typeof useApplyPackTemplate>>[0]["packListTemplateId"]
>;

type TemplateSummary = {
  _id: TemplateId;
  version: number;
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
  const events = useEventsById(
    packList === undefined ? undefined : [packList?.eventId],
  );
  // Only the dishes this list's items name, never the whole dish list.
  const dishes = useDishesByIds(
    packList == null || items === undefined
      ? undefined
      : items
          .filter((item) => item.packListId === packList._id)
          .map((item) => item.dishId),
  );
  const people = useListPerson();
  const createItem = useCreatePackListItem();
  const applyPackTemplate = useApplyPackTemplate();
  const templates = useListPackListTemplate();
  const adjustQuantity = usePackListItemAdjustQuantity();
  const annotateItem = usePackListItemAnnotate();
  const setItemBin = usePackListItemSetBin();
  const excludeItem = usePackListItemExclude();
  const assignLoad = usePackListItemAssignLoad();
  const setUnitWeight = usePackListItemSetUnitWeight();
  const setUnitVolume = usePackListItemSetUnitVolume();
  const restoreExcluded = usePackListItemRestoreExcluded();
  const refreshPackRules = useRefreshPackRules();
  const removeItem = usePackListItemRemove();
  const applyKit = usePackListApplyServiceStyleKit();
  const requestAssistance = usePackListRequestAssistance();
  const resolveAssistance = usePackListResolveAssistance();
  const serviceStyles = useListServiceStyle();
  const kitItems = useListServiceStyleKitItem();
  const markItemPacked = usePackListItemMarkPacked();
  const recordPackedCount = usePackListItemRecordPackedCount();
  const recordSentInstead = usePackListItemRecordSentInstead();
  const recordChecked = usePackListItemRecordChecked();
  const sectionClaims = useListPackSectionClaim();
  const authStatus = useAuthStatus();
  const takeSection = usePackSectionTake();
  const giveBackSection = usePackSectionClaimRelease();
  const recordLoaded = usePackListItemRecordLoaded();
  const recordReturn = usePackListItemRecordReturn();
  const markItemMissing = usePackListItemMarkMissing();
  const startPacking = usePackListStartPacking();
  const markPacked = usePackListMarkPacked();
  const markLoaded = usePackListMarkLoaded();
  const dispatch = usePackListDispatch();
  const cancel = usePackListCancel();
  const [showAdd, setShowAdd] = useState(false);
  // The whole dish list only while the add-item form is open.
  const formDishes = useWholeDishList(showAdd);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(
    null,
  );
  // The dispatch board and the returns page open a list on one view.
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<PackViewKind>(
    () =>
      PACK_VIEWS.find((option) => option.kind === searchParams.get("view"))
        ?.kind ?? "all",
  );
  const rigs = usePackRigs(packList ? packList.eventId : null);
  const transport = useEventTransport(packList ? packList.eventId : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [failureItemId, setFailureItemId] = useState<string | null>(null);
  // The row action that failed, so the row can offer "Try again" in place.
  const [failureRetryKey, setFailureRetryKey] = useState<string | null>(null);
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
      item.retiredAt == null &&
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
        <ReturnToListLink fallback="/logistics/packs" className="text-link">
          ← Pack lists
        </ReturnToListLink>
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

  // A generated line nothing asks for any more stays in the data (it comes
  // back if its source does) but not on the sheet.
  const listItems = (items ?? []).filter(
    (item) =>
      item.deletedAt == null &&
      item.packListId === packList._id &&
      item.retiredAt == null,
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
    setFailureRetryKey(null);
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
      setFailureRetryKey(
        key.includes(":") ? key.slice(key.indexOf(":") + 1) : null,
      );
    } finally {
      setBusy(null);
    }
  };

  // Who is packing which section of the warehouse walk. Taking a section
  // stops nobody: anyone may still count a line in it.
  const sectionAside = (group: { key: string; label: string }) => {
    const claim = sectionClaims?.find(
      (row) =>
        row.deletedAt == null &&
        row.packListId === packList._id &&
        row.sectionKey === group.key &&
        row.claimedAt != null &&
        row.releasedAt == null,
    );
    const mine =
      claim?.personId != null && claim.personId === authStatus?.personId;
    // One save: whoever had the section gives it back and you take it.
    const take = () =>
      run(`section:${group.key}`, async () => {
        await takeSection({
          packListId: packList._id as never,
          sectionKey: group.key,
        });
      });
    return (
      <div className="flex flex-wrap items-center gap-2 text-base text-ink-2">
        {claim && (
          <span>
            {mine
              ? "You are packing this"
              : `${claim.personName?.trim() || packedByName(claim.personId) || "Someone"} is packing this`}
          </span>
        )}
        {claim && mine && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy != null}
            onClick={() =>
              void run(`section:${group.key}`, async () => {
                await giveBackSection({
                  docId: claim._id,
                  version: claim.version,
                });
              })
            }
          >
            Give back
          </button>
        )}
        {!mine && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy != null}
            onClick={() => void take()}
          >
            {claim ? "Take over" : "I will pack this"}
          </button>
        )}
      </div>
    );
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

  const parseTemplateItems = (raw: string | null | undefined) =>
    parseTemplateLines(raw, PACK_LIST_UNITS);

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

  const templatePreviewRows = (template: TemplateSummary) =>
    previewTemplateApplication({
      templateId: template._id,
      templateVersion: template.version,
      lines: parseTemplateItems(template.items),
      listLines: listItems,
    });

  const generateFromTemplate = (template: TemplateSummary) => {
    void run(`generate:${template._id}`, async () => {
      const lines = parseTemplateItems(template.items).map(
        ({ description, requiredQuantity, unit }) => ({
          description,
          requiredQuantity,
          unit,
        }),
      );
      if (lines.length === 0) {
        throw new Error("This template has no valid items to generate.");
      }
      const scope = `pack-template:${packList._id}:${template._id}:${template.version}`;
      const pending = beginPendingOperation(scope, {
        packListId: packList._id,
        packListTemplateId: template._id,
        items: lines,
      });
      const result = await applyPackTemplate({
        ...pending.payload,
        operationKey: pending.key,
      });
      confirmPendingOperation(scope);
      setPreviewTemplateId(null);
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
      binNumber?: number | null;
      checkedQuantity?: number | null;
      loadedQuantity?: number | null;
      returnedQuantity?: number | null;
      usedQuantity?: number | null;
      lostQuantity?: number | null;
      damagedQuantity?: number | null;
      returnFinding?: string | null;
    },
    key: string,
  ) => {
    if (key === "secondCheck" || key === "onTruck") {
      const check = key === "secondCheck";
      const packed = Number(item.packedQuantity ?? 0);
      const saved = check ? item.checkedQuantity : item.loadedQuantity;
      const values = await prompt.askFields({
        title: check ? "Second check" : "On the truck",
        description: check
          ? `${packed} packed. Count it again and enter what you found. Enter 0 to clear the check.`
          : `${packed} packed. Enter how much of it is on the truck. Enter 0 to take it back off.`,
        confirmLabel: check ? "Save check" : "Save",
        fields: [
          {
            name: "amount",
            label: check ? "Amount counted" : "Amount on the truck",
            inputType: "number",
            required: true,
            defaultValue: String(saved ?? packed),
          },
        ],
      });
      if (!values) return;
      const amount = Number(values.amount);
      void run(`${item._id}:${key}`, async () => {
        if (check)
          await recordChecked({
            docId: item._id,
            version: item.version,
            checkedQuantity: amount,
          });
        else
          await recordLoaded({
            docId: item._id,
            version: item.version,
            loadedQuantity: amount,
          });
        setNotice(
          check
            ? amount > 0
              ? `Checked ${amount} of ${packed} packed.`
              : "Check cleared."
            : amount > 0
              ? `${amount} of ${packed} on the truck.`
              : "Taken off the truck.",
        );
      });
      return;
    }
    if (key === "countReturn") {
      const packed = packWentOut(item);
      const values = await prompt.askFields({
        title: "Count the return",
        description: `${packed} went out. Enter what came back, what was used up, what was lost and what came back broken. You can save this again later.`,
        confirmLabel: "Save return count",
        fields: [
          {
            name: "returned",
            label: "Came back",
            inputType: "number",
            required: true,
            defaultValue: String(item.returnedQuantity ?? packed),
          },
          {
            name: "used",
            label: "Used up",
            inputType: "number",
            required: false,
            defaultValue: String(item.usedQuantity ?? 0),
          },
          {
            name: "lost",
            label: "Lost",
            inputType: "number",
            required: false,
            defaultValue: String(item.lostQuantity ?? 0),
          },
          {
            name: "damaged",
            label: "Came back broken",
            inputType: "number",
            required: false,
            defaultValue: String(item.damagedQuantity ?? 0),
          },
          {
            name: "finding",
            label: "What you found (optional)",
            inputType: "text",
            required: false,
            defaultValue: item.returnFinding ?? "",
          },
        ],
      });
      if (!values) return;
      const amount = (raw: string | undefined) => Number(raw?.trim() || 0);
      void run(`${item._id}:countReturn`, async () => {
        await recordReturn({
          docId: item._id,
          version: item.version,
          returnedQuantity: amount(values.returned),
          usedQuantity: amount(values.used),
          lostQuantity: amount(values.lost),
          damagedQuantity: amount(values.damaged),
          finding: values.finding?.trim() || undefined,
        });
        setNotice("Return count saved.");
      });
      return;
    }
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
    if (key === "bin") {
      const values = await prompt.askFields({
        title: "Which bin is it in?",
        description:
          "Write the number on the black bin this line went in, so the crew can find it onsite. Leave it empty to clear it.",
        confirmLabel: "Save bin",
        fields: [
          {
            name: "bin",
            label: "Bin number",
            inputType: "number",
            required: false,
            defaultValue: item.binNumber ? String(item.binNumber) : "",
          },
        ],
      });
      if (!values) return;
      const raw = values.bin?.trim() ?? "";
      const binNumber = raw === "" ? undefined : Math.round(Number(raw));
      void run(`${item._id}:bin`, async () => {
        await setItemBin({
          docId: item._id,
          version: item.version,
          binNumber,
        });
        setNotice(binNumber ? `In bin ${binNumber}.` : "Bin number cleared.");
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
    if (key === "leaveOff") {
      const values = await prompt.askFields({
        title: "Leave this off the truck",
        description:
          "The line stays on the list with your reason. For a must-have item, say what stands in for it or who brings it, or the list can't be marked packed.",
        confirmLabel: "Leave off",
        fields: [
          { name: "reason", label: "Why", inputType: "text", required: true },
          {
            name: "replacement",
            label: "Stand-in (optional)",
            inputType: "text",
            required: false,
          },
          {
            name: "coveredBy",
            label: "Who covers it",
            required: false,
            options: [
              { value: "", label: "Nobody" },
              { value: "equivalent", label: "Something else does the job" },
              { value: "client", label: "The client brings it" },
              { value: "vendor", label: "A vendor brings it" },
            ],
          },
        ],
      });
      if (!values) return;
      void run(`${item._id}:leaveOff`, async () => {
        await excludeItem({
          docId: item._id,
          version: item.version,
          reason: values.reason?.trim() ?? "",
          replacementDescription: values.replacement?.trim() || undefined,
          coveredBy: values.coveredBy || undefined,
        });
        setNotice("Left off. The reason stays on the list.");
      });
      return;
    }
    if (key === "truck") {
      const values = await prompt.askFields({
        title: "Which truck carries this?",
        description: "Pick the truck, trailer or vendor drop on this event.",
        confirmLabel: "Save",
        fields: [
          {
            name: "rig",
            label: "Truck",
            required: false,
            options: [
              { value: "", label: "Not on a truck yet" },
              ...rigs.map((rig) => ({ value: rig.id, label: rig.label })),
            ],
          },
        ],
      });
      if (!values) return;
      void run(`${item._id}:truck`, async () => {
        await assignLoad({
          docId: item._id,
          version: item.version,
          loadAssignmentId: values.rig || undefined,
        });
        setNotice(
          values.rig
            ? "Line placed on the truck."
            : "Line taken off the truck.",
        );
      });
      return;
    }
    if (key === "weight") {
      const current = (item as { unitWeightKg?: number | null }).unitWeightKg;
      const values = await prompt.askFields({
        title: "How heavy is one?",
        description:
          "Weight of one unit in kg, so a truck is not loaded past what it can carry. Leave it empty if you do not know.",
        confirmLabel: "Save weight",
        fields: [
          {
            name: "kg",
            label: "Weight of one (kg)",
            inputType: "number",
            required: false,
            defaultValue: current == null ? "" : String(current),
          },
        ],
      });
      if (!values) return;
      const kg = values.kg?.trim() ?? "";
      void run(`${item._id}:weight`, async () => {
        await setUnitWeight({
          docId: item._id,
          version: item.version,
          unitWeightKg: kg === "" ? undefined : Number(kg),
        });
        setNotice(kg === "" ? "Weight cleared." : "Weight saved.");
      });
      return;
    }
    if (key === "size") {
      const current = (item as { unitVolumeM3?: number | null }).unitVolumeM3;
      const values = await prompt.askFields({
        title: "How much space does one take?",
        description:
          "Space of one unit in cubic metres (a 60 × 40 × 40 cm crate is 0.1), so a truck is not loaded past the space it has. Leave it empty if you do not know.",
        confirmLabel: "Save size",
        fields: [
          {
            name: "m3",
            label: "Space of one (m³)",
            inputType: "number",
            required: false,
            defaultValue: current == null ? "" : String(current),
          },
        ],
      });
      if (!values) return;
      const m3 = values.m3?.trim() ?? "";
      void run(`${item._id}:size`, async () => {
        await setUnitVolume({
          docId: item._id,
          version: item.version,
          unitVolumeM3: m3 === "" ? undefined : Number(m3),
        });
        setNotice(m3 === "" ? "Size cleared." : "Size saved.");
      });
      return;
    }
    if (key === "putBack") {
      void run(`${item._id}:putBack`, async () => {
        await restoreExcluded({ docId: item._id, version: item.version });
        setNotice("Back on the list.");
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
      <ReturnToListLink fallback="/logistics/packs" className="text-link">
        ← Pack lists
      </ReturnToListLink>
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Load sheet</p>
          <h1 className="display-title mt-2">
            {packListName(packList.name, eventTitle)}
          </h1>
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
              disabled={
                busy != null ||
                (action.key === "startPacking" && listItems.length === 0)
              }
              title={
                action.key === "startPacking" && listItems.length === 0
                  ? "Add items before packing."
                  : undefined
              }
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
          {String(packList.status) !== "cancelled" ? (
            <button
              className="btn btn-ghost"
              type="button"
              aria-pressed={showScan}
              onClick={() => setShowScan((value) => !value)}
            >
              {showScan ? "Close scan" : "Scan labels"}
            </button>
          ) : null}
          {listIsLive ? (
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy != null}
              onClick={() =>
                void run("list:refresh", async () => {
                  await refreshPackRules({ packListId: packList._id });
                  setNotice(
                    "Pack lines now match the event and the pack rules. Amounts you set by hand stay.",
                  );
                })
              }
            >
              {busy === "list:refresh" ? "Working…" : "Update from the event"}
            </button>
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
      {listIsLive ? <PackReadinessNotice lines={listItems} /> : null}
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

      {showScan && String(packList.status) !== "cancelled" ? (
        <PackScanPanel
          packList={{
            _id: packList._id,
            version: packList.version,
            eventId: packList.eventId,
            status: String(packList.status),
          }}
          eventNumber={event?.eventNumber}
          lines={listItems.map((item) => ({
            ...item,
            status: String(item.status),
            requiredQuantity: Number(item.requiredQuantity),
            packedQuantity: Number(item.packedQuantity),
            unit: String(item.unit),
          }))}
          rigs={rigs}
        />
      ) : null}

      {showAdd && canAddItems ? (
        <PackListItemForm
          dishes={formDishes ?? []}
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
              <Link
                className="link"
                to="/logistics/pack-templates"
                target="_blank"
                rel="noopener"
              >
                Create one
              </Link>{" "}
              (opens a new tab; this list stays as it is and the new template
              shows up here right away).
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
                      onClick={() =>
                        setPreviewTemplateId((current) =>
                          current === template._id ? null : template._id,
                        )
                      }
                    >
                      Generate
                    </button>
                    {previewTemplateId === template._id ? (
                      <div className="w-full">
                        <PackTemplatePreview
                          templateName={template.name}
                          rows={templatePreviewRows(template)}
                          busy={busy === `generate:${template._id}`}
                          onApply={() => generateFromTemplate(template)}
                          onCancel={() => setPreviewTemplateId(null)}
                        />
                      </div>
                    ) : null}
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
        <PackListViews
          view={view}
          onViewChange={setView}
          sectionAside={sectionAside}
          rigs={rigs}
          transport={transport}
          loading={
            items === undefined || events === undefined || dishes === undefined
          }
          items={listItems}
          canAddItems={canAddItems}
          canEditLines={listIsLive}
          canCount={String(packList.status) !== "cancelled"}
          canCountReturn={String(packList.status) === "dispatched"}
          busy={busy}
          dishName={dishName}
          packedByName={packedByName}
          itemActions={(status) => policy.packItemActions(status)}
          failedItem={
            failureItemId && failure
              ? {
                  id: failureItemId,
                  message: classifyCommandFailure(failure).title,
                  detail: classifyCommandFailure(failure).detail,
                  retryKey: failureRetryKey,
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
          reviewEventId={String(packList.eventId)}
        />
      </section>

      <PackBinSheet
        packList={{
          _id: packList._id,
          version: packList.version,
          binSheet: packList.binSheet,
          status: String(packList.status),
        }}
        lines={listItems}
      />

      <PackFoodPackaging
        eventId={packList.eventId}
        serviceStyleId={event?.serviceStyleId ?? null}
        serviceStyleName={serviceStyle?.name}
      />

      <PackListSourcePanel packListId={packList._id} />

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
