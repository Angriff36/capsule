import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  useCreateStockCountLine,
  useCreateStockCountSession,
  useListIngredient,
  useListInventoryItem,
  useListStockCountLine,
  useListStockCountSession,
  useListStorageLocation,
  useStockCountLineConfirmLedgerMatch,
  useStockCountLineReconcileVariance,
  useStockCountLineRecordCount,
  useStockCountLineReviseCount,
  useStockCountSessionClose,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import { SupplyFailureBanner } from "./SupplyFailureBanner";
import "./StockCountPage.css";

const quantity = (value: number) => Math.round(value * 10_000) / 10_000;

const formatQuantity = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);

const formatTimestamp = (value: number | null | undefined) =>
  value == null
    ? "—"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(value);

export function StockCountPage() {
  const sessions = useListStockCountSession();
  const lines = useListStockCountLine();
  const items = useListInventoryItem();
  const locations = useListStorageLocation();
  const ingredients = useListIngredient();
  const createSession = useCreateStockCountSession();
  const createLine = useCreateStockCountLine();
  const recordCount = useStockCountLineRecordCount();
  const reviseCount = useStockCountLineReviseCount();
  const confirmLedgerMatch = useStockCountLineConfirmLedgerMatch();
  const reconcileVariance = useStockCountLineReconcileVariance();
  const closeSession = useStockCountSessionClose();

  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [activeLineId, setActiveLineId] = useState("");
  const [showStart, setShowStart] = useState(false);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [countValue, setCountValue] = useState("");
  const [countNote, setCountNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeLocations = useMemo(
    () =>
      (locations ?? [])
        .filter(
          (location) =>
            location.deletedAt == null && String(location.status) === "active",
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [locations],
  );
  const activeItems = useMemo(
    () => (items ?? []).filter((item) => item.deletedAt == null),
    [items],
  );
  const orderedSessions = useMemo(
    () =>
      [...(sessions ?? [])]
        .filter((session) => session.deletedAt == null)
        .sort(
          (left, right) =>
            Number(String(right.status) === "in_progress") -
              Number(String(left.status) === "in_progress") ||
            Number(right.startedAt ?? right.createdAt ?? 0) -
              Number(left.startedAt ?? left.createdAt ?? 0),
        ),
    [sessions],
  );

  useEffect(() => {
    if (
      selectedSessionId &&
      orderedSessions.some((row) => row._id === selectedSessionId)
    ) {
      return;
    }
    setSelectedSessionId(orderedSessions[0]?._id ?? "");
  }, [orderedSessions, selectedSessionId]);

  const selectedSession = orderedSessions.find(
    (session) => session._id === selectedSessionId,
  );
  const sessionLines = useMemo(
    () =>
      (lines ?? [])
        .filter(
          (line) =>
            line.deletedAt == null &&
            line.stockCountSessionId === selectedSessionId,
        )
        .sort((left, right) => {
          const leftLocation =
            locations?.find((row) => row._id === left.locationId)?.name ?? "";
          const rightLocation =
            locations?.find((row) => row._id === right.locationId)?.name ?? "";
          const leftIngredient =
            ingredients?.find((row) => row._id === left.ingredientId)?.name ??
            "";
          const rightIngredient =
            ingredients?.find((row) => row._id === right.ingredientId)?.name ??
            "";
          return (
            leftLocation.localeCompare(rightLocation) ||
            leftIngredient.localeCompare(rightIngredient)
          );
        }),
    [ingredients, lines, locations, selectedSessionId],
  );
  const pendingLines = sessionLines.filter(
    (line) => String(line.status) !== "reconciled",
  );
  const reconciledCount = sessionLines.length - pendingLines.length;
  const setupComplete =
    selectedSession != null &&
    sessionLines.length === selectedSession.lineCount;
  const canClose =
    selectedSession?.status === "in_progress" &&
    setupComplete &&
    pendingLines.length === 0;

  useEffect(() => {
    if (
      activeLineId &&
      sessionLines.some(
        (line) =>
          line._id === activeLineId && String(line.status) !== "reconciled",
      )
    ) {
      return;
    }
    setActiveLineId(pendingLines[0]?._id ?? sessionLines[0]?._id ?? "");
  }, [activeLineId, pendingLines, sessionLines]);

  const activeLine = sessionLines.find((line) => line._id === activeLineId);
  const activeItem = activeLine
    ? activeItems.find((item) => item._id === activeLine.inventoryItemId)
    : undefined;
  const activeIngredient = activeLine
    ? ingredients?.find((row) => row._id === activeLine.ingredientId)
    : undefined;
  const activeLocation = activeLine
    ? locations?.find((row) => row._id === activeLine.locationId)
    : undefined;
  const ledgerQuantity = quantity(Number(activeItem?.quantityOnHand ?? 0));
  const countedQuantity = quantity(Number(activeLine?.countedQuantity ?? 0));
  const needsAdjustment =
    activeLine?.status === "counted" && countedQuantity !== ledgerQuantity;

  useEffect(() => {
    if (!activeLine) {
      setCountValue("");
      setCountNote("");
      setReason("");
      return;
    }
    setCountValue(
      String(activeLine.status) === "pending"
        ? ""
        : String(activeLine.countedQuantity),
    );
    setCountNote(activeLine.countNote ?? "");
    setReason(
      selectedSession
        ? `Stock count · ${selectedSession.label}`
        : "Stock count",
    );
  }, [activeLine?._id, activeLine?.version, selectedSession?.label]);

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

  const stockLinesForLocations = (locationIds: string[]) =>
    activeItems
      .filter((item) => locationIds.includes(item.locationId))
      .sort((left, right) => {
        const leftLocation =
          activeLocations.find((row) => row._id === left.locationId)?.name ??
          "";
        const rightLocation =
          activeLocations.find((row) => row._id === right.locationId)?.name ??
          "";
        const leftIngredient =
          ingredients?.find((row) => row._id === left.ingredientId)?.name ?? "";
        const rightIngredient =
          ingredients?.find((row) => row._id === right.ingredientId)?.name ??
          "";
        return (
          leftLocation.localeCompare(rightLocation) ||
          leftIngredient.localeCompare(rightIngredient)
        );
      });

  const freezeLines = async (sessionId: string, scopedItems: any[]) => {
    for (const item of scopedItems) {
      await createLine({
        stockCountSessionId: sessionId,
        inventoryItemId: item._id,
        locationId: item.locationId,
        ingredientId: item.ingredientId,
        unit: item.unit,
        idempotencyKey: `stock-count:${sessionId}:${item._id}:freeze`,
      });
    }
  };

  const submitStart = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const locationIds = [...selectedLocationIds];
    const selectedLocations = activeLocations.filter((location) =>
      locationIds.includes(location._id),
    );
    if (selectedLocations.length === 0) {
      setFailure(new Error("Choose at least one storage location."));
      return;
    }
    const scopedItems = stockLinesForLocations(locationIds);
    void run("start-session", async () => {
      const created = await createSession({
        label: String(data.get("label") ?? "").trim(),
        locationIds: JSON.stringify(locationIds),
        locationNames: selectedLocations.map((row) => row.name).join(", "),
        lineCount: scopedItems.length,
      });
      await freezeLines(created.docId, scopedItems);
      setSelectedSessionId(created.docId);
      setSelectedLocationIds([]);
      setShowStart(false);
      form.reset();
      setNotice(
        `Count started with ${scopedItems.length} frozen stock ${scopedItems.length === 1 ? "line" : "lines"}.`,
      );
    });
  };

  const completeSetup = () => {
    if (!selectedSession) return;
    let locationIds: string[] = [];
    try {
      const parsed = JSON.parse(selectedSession.locationIds);
      locationIds = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      setFailure(
        new Error("This count session has an unreadable location scope."),
      );
      return;
    }
    const existingItemIds = new Set(
      sessionLines.map((line) => line.inventoryItemId),
    );
    const missing = stockLinesForLocations(locationIds)
      .filter((item) => !existingItemIds.has(item._id))
      .slice(0, selectedSession.lineCount - sessionLines.length);
    if (missing.length !== selectedSession.lineCount - sessionLines.length) {
      setFailure(
        new Error(
          "The original stock-line scope cannot be rebuilt. Keep this session open and start a fresh count for the current stock book.",
        ),
      );
      return;
    }
    void run("repair-session", async () => {
      await freezeLines(selectedSession._id, missing);
      setNotice("The missing frozen count lines were restored.");
    });
  };

  const submitCount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeLine || String(activeLine.status) === "reconciled") return;
    const nextQuantity = Number(countValue);
    if (!Number.isFinite(nextQuantity) || nextQuantity < 0) {
      setFailure(new Error("Enter a counted quantity of zero or more."));
      return;
    }
    const payload = {
      docId: activeLine._id,
      version: activeLine.version,
      countedQuantity: quantity(nextQuantity),
      countNote: countNote.trim() || undefined,
    };
    void run(`${activeLine._id}:count`, async () => {
      if (String(activeLine.status) === "pending") await recordCount(payload);
      else await reviseCount(payload);
      setNotice(
        String(activeLine.status) === "pending"
          ? "Physical count saved. Review the variance, then reconcile this line."
          : "Physical count revised.",
      );
    });
  };

  const reconcileActiveLine = () => {
    if (!activeLine || String(activeLine.status) !== "counted") return;
    void run(`${activeLine._id}:reconcile`, async () => {
      if (needsAdjustment) {
        await reconcileVariance({
          docId: activeLine._id,
          version: activeLine.version,
          reason: reason.trim(),
        });
        setNotice(
          `Variance reconciled. The ledger was adjusted by ${formatSigned(countedQuantity - ledgerQuantity)} ${activeLine.unit}.`,
        );
      } else {
        await confirmLedgerMatch({
          docId: activeLine._id,
          version: activeLine.version,
        });
        setNotice(
          "Count matched the current ledger; no adjustment was posted.",
        );
      }
    });
  };

  const invokeClose = () => {
    if (!selectedSession) return;
    void run("close-session", async () => {
      await closeSession({
        docId: selectedSession._id,
        version: selectedSession.version,
      });
      setNotice(
        "Stock count closed. Frozen expectations and adjustments remain in the ledger.",
      );
    });
  };

  const loading =
    sessions === undefined ||
    lines === undefined ||
    items === undefined ||
    locations === undefined ||
    ingredients === undefined;

  return (
    <div
      className="operations-stage supply-stage stock-count-page"
      data-testid="stock-count-page"
    >
      <header className="supply-masthead stock-count-masthead">
        <div>
          <p className="eyebrow">Inventory · Physical control</p>
          <h1 className="display-title mt-2">Stock count sessions</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Freeze the book by storage area, move item by item, then post only
            the adjustments needed to bring the ledger back to the shelf.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="start-stock-count"
          disabled={busy != null || activeLocations.length === 0}
          onClick={() => setShowStart((value) => !value)}
        >
          {showStart ? "Close setup" : "Start stock count"}
        </button>
      </header>
      <InventoryWorkspaceNav />

      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="stock-count-notice" role="status">
          {notice}
        </p>
      ) : null}

      {showStart ? (
        <form className="stock-count-setup" onSubmit={submitStart}>
          <div className="stock-count-setup-copy">
            <p className="eyebrow">01 · Define the walk</p>
            <h2>Name the count and choose storage</h2>
            <p>
              Every active stock line in the selected locations gets its own
              frozen expected quantity.
            </p>
          </div>
          <label
            className="field-label stock-count-label"
            htmlFor="stock-count-label"
          >
            Session name
            <input
              id="stock-count-label"
              name="label"
              className="input"
              required
              defaultValue={`Stock count · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            />
          </label>
          <fieldset className="stock-count-location-grid">
            <legend>Storage locations</legend>
            {activeLocations.map((location) => {
              const lineCount = activeItems.filter(
                (item) => item.locationId === location._id,
              ).length;
              const checked = selectedLocationIds.includes(location._id);
              return (
                <label
                  key={location._id}
                  className={checked ? "selected" : undefined}
                >
                  <input
                    type="checkbox"
                    name="locationId"
                    value={location._id}
                    checked={checked}
                    onChange={(event) => {
                      const isChecked = event.currentTarget.checked;
                      setSelectedLocationIds((current) =>
                        isChecked
                          ? [...current, location._id]
                          : current.filter((id) => id !== location._id),
                      );
                    }}
                  />
                  <span>
                    <strong>{location.name}</strong>
                    <small>
                      {lineCount} stock {lineCount === 1 ? "line" : "lines"}
                    </small>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <div className="stock-count-setup-footer">
            <span>
              {stockLinesForLocations(selectedLocationIds).length} quantities
              will be frozen when the session starts.
            </span>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy != null || selectedLocationIds.length === 0}
            >
              {busy === "start-session"
                ? "Freezing quantities…"
                : "Freeze & begin"}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <TableSkeleton rows={8} />
      ) : orderedSessions.length === 0 ? (
        <section className="stock-count-empty">
          <span>00</span>
          <div>
            <p className="eyebrow">No count sheets yet</p>
            <h2>Start with the room you can finish.</h2>
            <p>
              Choose a walk-in, freezer, dry store, or several locations. The
              ledger snapshot happens when each count line is created.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowStart(true)}
          >
            Start the first count
          </button>
        </section>
      ) : (
        <div
          className="stock-count-workspace"
          data-testid="stock-count-workspace"
        >
          <aside
            className="stock-count-session-rail"
            aria-label="Count sessions"
          >
            <div className="stock-count-session-rail-heading">
              <span>Count sheets</span>
              <strong>{orderedSessions.length}</strong>
            </div>
            {orderedSessions.map((session) => {
              const rows = (lines ?? []).filter(
                (line) =>
                  line.deletedAt == null &&
                  line.stockCountSessionId === session._id,
              );
              const done = rows.filter(
                (line) => String(line.status) === "reconciled",
              ).length;
              return (
                <button
                  type="button"
                  key={session._id}
                  className={
                    session._id === selectedSessionId ? "active" : undefined
                  }
                  onClick={() => {
                    setSelectedSessionId(session._id);
                    setActiveLineId("");
                  }}
                >
                  <span className="stock-count-session-kicker">
                    {String(session.status) === "closed"
                      ? "Closed"
                      : "In progress"}
                  </span>
                  <strong>{session.label}</strong>
                  <small>{session.locationNames}</small>
                  <span className="stock-count-session-meter">
                    <i
                      style={{
                        width: `${session.lineCount === 0 ? 100 : Math.min(100, (done / session.lineCount) * 100)}%`,
                      }}
                    />
                  </span>
                  <small>
                    {done}/{session.lineCount} reconciled
                  </small>
                </button>
              );
            })}
          </aside>

          {selectedSession ? (
            <main className="stock-count-sheet">
              <section className="stock-count-sheet-head">
                <div>
                  <p className="eyebrow">02 · Walk and reconcile</p>
                  <h2>{selectedSession.label}</h2>
                  <p>{selectedSession.locationNames}</p>
                </div>
                <div className="stock-count-sheet-status">
                  <StatusChip status={String(selectedSession.status)} />
                  <strong>
                    {reconciledCount}/{selectedSession.lineCount}
                  </strong>
                  <span>reconciled</span>
                </div>
              </section>

              {!setupComplete ? (
                <section className="stock-count-setup-warning" role="alert">
                  <div>
                    <strong>Count setup is incomplete.</strong>
                    <span>
                      {sessionLines.length} of {selectedSession.lineCount}{" "}
                      frozen lines exist. Restore the missing lines before
                      counting.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null}
                    onClick={completeSetup}
                  >
                    {busy === "repair-session" ? "Restoring…" : "Restore setup"}
                  </button>
                </section>
              ) : null}

              {activeLine &&
              String(selectedSession.status) === "in_progress" ? (
                <section
                  className="stock-count-counter"
                  data-testid="stock-count-workflow"
                >
                  <div className="stock-count-counter-index">
                    <span>Line</span>
                    <strong>
                      {String(sessionLines.indexOf(activeLine) + 1).padStart(
                        2,
                        "0",
                      )}
                    </strong>
                    <small>of {sessionLines.length}</small>
                  </div>
                  <div className="stock-count-counter-body">
                    <div className="stock-count-counter-title">
                      <div>
                        <span>
                          {activeLocation?.name ?? "Unknown location"}
                        </span>
                        <h3>
                          {activeIngredient?.name ?? "Unknown ingredient"}
                        </h3>
                      </div>
                      <StatusChip status={String(activeLine.status)} />
                    </div>
                    <div className="stock-count-facts">
                      <CountFact
                        label="Frozen expected"
                        value={formatQuantity(activeLine.expectedQuantity)}
                        unit={activeLine.unit}
                      />
                      <CountFact
                        label="Ledger now"
                        value={formatQuantity(ledgerQuantity)}
                        unit={activeLine.unit}
                      />
                      <CountFact
                        label="Count variance"
                        value={
                          String(activeLine.status) === "pending"
                            ? "—"
                            : formatSigned(activeLine.varianceQuantity)
                        }
                        unit={activeLine.unit}
                        tone={
                          activeLine.varianceQuantity === 0
                            ? "quiet"
                            : "variance"
                        }
                      />
                    </div>
                    {String(activeLine.status) !== "reconciled" ? (
                      <form
                        className="stock-count-entry"
                        onSubmit={submitCount}
                      >
                        <label htmlFor="stock-count-quantity">
                          <span>Counted quantity</span>
                          <div>
                            <input
                              id="stock-count-quantity"
                              className="input"
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.0001"
                              required
                              value={countValue}
                              onChange={(event) =>
                                setCountValue(event.currentTarget.value)
                              }
                            />
                            <strong>{activeLine.unit}</strong>
                          </div>
                        </label>
                        <label htmlFor="stock-count-note">
                          <span>
                            Count note <small>optional</small>
                          </span>
                          <input
                            id="stock-count-note"
                            className="input"
                            value={countNote}
                            onChange={(event) =>
                              setCountNote(event.currentTarget.value)
                            }
                            placeholder="Damaged case, open bag, second pass…"
                          />
                        </label>
                        <button
                          type="submit"
                          className="btn btn-ghost"
                          disabled={busy != null}
                        >
                          {busy === `${activeLine._id}:count`
                            ? "Saving…"
                            : String(activeLine.status) === "pending"
                              ? "Save count"
                              : "Revise count"}
                        </button>
                      </form>
                    ) : null}

                    {String(activeLine.status) === "counted" ? (
                      <div
                        className={
                          needsAdjustment
                            ? "stock-count-reconcile has-variance"
                            : "stock-count-reconcile"
                        }
                      >
                        <div>
                          <span>
                            {needsAdjustment
                              ? "Ledger adjustment required"
                              : "Current ledger matches the shelf"}
                          </span>
                          <strong>
                            {needsAdjustment
                              ? `${formatSigned(countedQuantity - ledgerQuantity)} ${activeLine.unit}`
                              : "No adjustment entry"}
                          </strong>
                        </div>
                        {needsAdjustment ? (
                          <label htmlFor="stock-count-reason">
                            Adjustment reason
                            <input
                              id="stock-count-reason"
                              className="input"
                              required
                              value={reason}
                              onChange={(event) =>
                                setReason(event.currentTarget.value)
                              }
                            />
                          </label>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={
                            busy != null || (needsAdjustment && !reason.trim())
                          }
                          onClick={reconcileActiveLine}
                        >
                          {busy === `${activeLine._id}:reconcile`
                            ? "Reconciling…"
                            : needsAdjustment
                              ? "Post adjustment & reconcile"
                              : "Confirm ledger match"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : setupComplete && sessionLines.length === 0 ? (
                <section className="stock-count-zero-sheet">
                  <strong>No stock lines were open in this scope.</strong>
                  <span>
                    The selected locations are counted and ready to close.
                  </span>
                </section>
              ) : null}

              <section className="stock-count-line-queue">
                <div className="ledger-heading">
                  <div>
                    <p className="eyebrow">Frozen count sheet</p>
                    <h2>Line queue</h2>
                  </div>
                  <span>{sessionLines.length} lines</span>
                </div>
                <div className="stock-count-line-list">
                  {sessionLines.map((line, index) => {
                    const ingredient = ingredients?.find(
                      (row) => row._id === line.ingredientId,
                    );
                    const location = locations?.find(
                      (row) => row._id === line.locationId,
                    );
                    return (
                      <button
                        type="button"
                        key={line._id}
                        className={
                          line._id === activeLineId ? "active" : undefined
                        }
                        onClick={() => setActiveLineId(line._id)}
                      >
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <div>
                          <strong>
                            {ingredient?.name ?? "Unknown ingredient"}
                          </strong>
                          <small>{location?.name ?? "Unknown location"}</small>
                        </div>
                        <div>
                          <strong>
                            {formatQuantity(line.expectedQuantity)} {line.unit}
                          </strong>
                          <small>frozen</small>
                        </div>
                        <div>
                          <strong>
                            {String(line.status) === "pending"
                              ? "—"
                              : `${formatQuantity(line.countedQuantity)} ${line.unit}`}
                          </strong>
                          <small>counted</small>
                        </div>
                        <StatusChip status={String(line.status)} />
                      </button>
                    );
                  })}
                </div>
              </section>

              <footer className="stock-count-closeout">
                <div>
                  <p className="eyebrow">03 · Close the sheet</p>
                  <strong>
                    {selectedSession.status === "closed"
                      ? `Closed ${formatTimestamp(selectedSession.closedAt)}`
                      : canClose
                        ? "Every line is reconciled."
                        : `${pendingLines.length} ${pendingLines.length === 1 ? "line remains" : "lines remain"}.`}
                  </strong>
                  <span>
                    Closing preserves the frozen expectations, physical counts,
                    and posted adjustment references.
                  </span>
                </div>
                {selectedSession.status === "in_progress" ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    data-testid="close-stock-count"
                    disabled={!canClose || busy != null}
                    onClick={invokeClose}
                  >
                    {busy === "close-session"
                      ? "Closing…"
                      : "Close count session"}
                  </button>
                ) : null}
              </footer>
            </main>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CountFact({
  label,
  value,
  unit,
  tone = "quiet",
}: {
  label: string;
  value: string;
  unit: string;
  tone?: "quiet" | "variance";
}) {
  return (
    <div className={tone === "variance" ? "variance" : undefined}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{unit}</small>
    </div>
  );
}

function formatSigned(value: number) {
  const rounded = quantity(value);
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : ""}${formatQuantity(rounded)}`;
}
