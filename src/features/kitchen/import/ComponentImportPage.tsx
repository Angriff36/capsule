import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  useCreateIngredient,
  useCreateComponent,
  useCreateComponentIngredient,
  useGetComponentImport,
  useListComponentImport,
  useListComponentImportLine,
  useListIngredient,
  useComponentImportApproveReview,
} from "../../../lib/manifest-convex-react";
import {
  useCreateComponentImportReview,
  useImportComponentSafely,
  useSaveComponentImportReview,
} from "../../../lib/safeCulinaryOperations";
import { CulinaryFailureBanner } from "../CulinaryFailureBanner";
import { KitchenBookNav } from "../KitchenBookNav";
import { COMPONENT_IMPORT_PATH, componentPath } from "../kitchenRoutes";
import { ComponentImportCoordinator } from "./ComponentImportCoordinator";
import { ComponentImportFinalizer } from "./ComponentImportFinalizer";
import {
  ComponentImportRepository,
  mapStoredReview,
  type ComponentImportSourceInput,
  type StoredComponentImportLineRow,
  type StoredComponentImportRow,
} from "./ComponentImportRepository";
import {
  beginPendingOperation,
  confirmPendingOperation,
} from "../../../lib/pendingOperationKey";
import { isPlausibleConvexId } from "../../../lib/routeRecord";
import { componentImportOutcome } from "../culinaryRecovery";
import {
  ImportSourceReadinessChecker,
  type ImportSourceMode,
} from "./ImportSourceReadiness";
import {
  ComponentImportReviewPane,
  ComponentImportSourcePane,
  type ComponentImportSaveState,
} from "./ComponentImportPanes";
import {
  ComponentImportSourcePanel,
  IMPORT_STATUS_LABELS,
} from "./ComponentImportSourcePanel";
import {
  countUnresolvedLines,
  reviewIsReady,
  reviewMeasurementIssues,
  type ComponentImportReviewState,
} from "./ComponentImportTypes";

const coordinator = new ComponentImportCoordinator();
const sourceReadiness = new ImportSourceReadinessChecker();

/** Saved imports the operator can still act on; completed/cancelled are history. */
const RESUMABLE_STATUSES: ReadonlySet<string> = new Set([
  "uploaded",
  "parsed",
  "reviewing",
  "ready",
  "finalizing",
  "failed",
]);

type MobilePane = "source" | "review";

export function ComponentImportPage() {
  const importComponent = useImportComponentSafely();
  const createReviewMutation = useCreateComponentImportReview();
  const saveReviewMutation = useSaveComponentImportReview();
  const approveReviewMutation = useComponentImportApproveReview();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const importIdParam = searchParams.get("importId");
  const liveRef = useRef<HTMLDivElement>(null);
  const ingredients = useListIngredient();
  const allImports = useListComponentImport();
  const allImportLines = useListComponentImportLine();
  // Generated id queries throw on malformed ids, so an implausible ?importId
  // never reaches the server — it renders the page's own unavailable state.
  const importIdUsable =
    importIdParam != null && isPlausibleConvexId(importIdParam);
  const storedImport = useGetComponentImport(
    importIdUsable ? importIdParam : "skip",
  );
  // Culinary features use generated hooks only (integration guard), so the
  // import's lines are the tenant list filtered to this import.
  const storedLines = useMemo(() => {
    if (importIdParam == null) return [];
    if (allImportLines === undefined) return undefined;
    return allImportLines.filter(
      (line) => line.importId === importIdParam,
    ) as unknown as StoredComponentImportLineRow[];
  }, [importIdParam, allImportLines]);
  const createIngredient = useCreateIngredient();
  const createComponent = useCreateComponent();
  const createComponentIngredient = useCreateComponentIngredient();
  const [mobilePane, setMobilePane] = useState<MobilePane>("source");
  const [sourceMode, setSourceMode] = useState<ImportSourceMode>("paste");
  const [source, setSource] = useState("");
  const [sheetCsv, setSheetCsv] = useState("");
  const [linesCsv, setLinesCsv] = useState("");
  const [sheetFilename, setSheetFilename] = useState<string>();
  const [linesFilename, setLinesFilename] = useState<string>();
  const [textFilename, setTextFilename] = useState<string>();
  const [fileLoading, setFileLoading] = useState(false);
  const [review, setReview] = useState<ComponentImportReviewState | null>(null);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sourceHint, setSourceHint] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [recoveredComponentId, setRecoveredComponentId] = useState<
    string | null
  >(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<ComponentImportSaveState>("idle");
  const [dirty, setDirty] = useState(false);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);

  // Latest-value refs so the storage-sync effect can read the editor state
  // without re-running on every keystroke.
  const reviewRef = useRef<ComponentImportReviewState | null>(null);
  reviewRef.current = review;
  const dirtyRef = useRef(false);
  const mappedRef = useRef<ComponentImportReviewState | null>(null);
  const repositoryRef = useRef<ComponentImportRepository | null>(null);
  if (repositoryRef.current == null) {
    // The workbench loads saved rows reactively through generated queries and
    // adopts them as the save baseline; the get/list ports belong to callers
    // that load imperatively (the runtime proofs).
    repositoryRef.current = new ComponentImportRepository({
      createReview: (request) =>
        createReviewMutation(request as never) as Promise<{
          importId: string;
          reviewRevision: number;
          lineIds: string[];
        }>,
      saveReview: (request) =>
        saveReviewMutation(request as never) as Promise<{
          reviewRevision: number;
        }>,
      approveReview: (importId) =>
        approveReviewMutation({ docId: importId }) as Promise<unknown>,
      getImport: async () => {
        throw new Error("Workbench loads imports reactively; not callable");
      },
      listLinesByImportId: async () => {
        throw new Error("Workbench loads imports reactively; not callable");
      },
    });
  }

  const catalog = useMemo(
    () =>
      (ingredients ?? [])
        .filter((item) => item.deletedAt == null)
        .map((item) => ({
          id: String(item._id),
          name: String(item.name),
          unit: item.unit != null ? String(item.unit) : undefined,
          deletedAt: item.deletedAt as number | null | undefined,
        })),
    [ingredients],
  );

  const resumableImports = useMemo(
    () =>
      (allImports ?? [])
        .filter(
          (row) => row.deletedAt == null && RESUMABLE_STATUSES.has(row.status),
        )
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 8),
    [allImports],
  );

  const unresolvedCount = review ? countUnresolvedLines(review.lines) : 0;
  const readiness = useMemo(
    () =>
      sourceReadiness.evaluate({
        mode: sourceMode,
        source,
        sheetCsv,
        linesCsv,
        fileLoading,
        textFilename,
      }),
    [sourceMode, source, sheetCsv, linesCsv, fileLoading, textFilename],
  );
  const fileStatus = useMemo(
    () =>
      sourceReadiness.fileStatusLabel({
        mode: sourceMode,
        source,
        sheetCsv,
        linesCsv,
        fileLoading,
        textFilename,
      }),
    [sourceMode, source, sheetCsv, linesCsv, fileLoading, textFilename],
  );
  const displayHint =
    sourceHint ??
    (!readiness.ready && (sheetCsv || linesCsv || source.trim())
      ? readiness.message
      : null);

  const announce = (message: string) => {
    setStatusMessage(message);
  };

  const markDirty = () => {
    dirtyRef.current = true;
    setDirty(true);
  };

  const markClean = () => {
    dirtyRef.current = false;
    setDirty(false);
  };

  const handleReviewChange = (next: ComponentImportReviewState) => {
    markDirty();
    setReview(next);
  };

  // Reactive storage sync: adopts the saved review once its rows arrive, keeps
  // local edits when a newer saved revision appears, and never overwrites a
  // dirty editor silently.
  useEffect(() => {
    if (importIdParam == null || storedImport == null || storedLines == null)
      return;
    const mapped = mapStoredReview(
      storedImport as unknown as StoredComponentImportRow,
      storedLines as unknown as StoredComponentImportLineRow[],
    );
    mappedRef.current = mapped;
    repositoryRef.current?.adopt(mapped);
    const current = reviewRef.current;
    if (current && current.importId === mapped.importId) {
      // Same revision: the editor already reflects this saved version — keep
      // it, including unsaved edits made on that revision.
      if (current.reviewRevision === mapped.reviewRevision) return;
      // A newer saved revision exists: keep the dirty editor untouched and
      // say so; a clean editor silently adopts the newer version.
      if (dirtyRef.current) {
        setConflictNotice(
          "A newer saved version of this review exists. Your edits are kept below — reload the saved version to replace them.",
        );
        return;
      }
    }
    setConflictNotice(null);
    setReview(mapped);
    markClean();
    // A resumed durable review has no unsaved edits yet.
    setSaveState((state) => (state === "saving" ? state : "idle"));
  }, [importIdParam, storedImport, storedLines]);

  const parseSource = () => {
    if (parsing || busy) return;
    setFailure(null);
    setRecoveryNotice(null);
    setRecoveredComponentId(null);
    if (!readiness.ready) {
      setSourceHint(readiness.message ?? "Add source input before parsing.");
      announce(readiness.message ?? "Add source input before parsing.");
      return;
    }
    setSourceHint(null);
    setParsing(true);
    try {
      let next: ComponentImportReviewState;
      if (readiness.kind === "csv_bundle") {
        next = coordinator.parseCsvBundle(
          sheetCsv,
          linesCsv,
          catalog,
          sheetFilename,
          linesFilename,
        );
      } else if (readiness.kind === "text_file") {
        next = coordinator.parseTextFile(
          source,
          textFilename ?? "component.txt",
          catalog,
        );
      } else {
        next = coordinator.parseText(source, catalog, "pasted_text");
      }
      setReview(next);
      markClean();
      setSaveState("idle");
      setConflictNotice(null);
      setMobilePane("review");
      announce(
        `Parsed ${next.lines.length} ingredient lines, ${countUnresolvedLines(next.lines)} unresolved matches, ${reviewMeasurementIssues(next).length} missing measurements.`,
      );
    } catch (error) {
      setFailure(error);
      announce("Parsing failed.");
    } finally {
      setParsing(false);
    }
  };

  const loadFile = async (
    file: File,
    apply: (text: string, filename: string) => void,
  ) => {
    setFailure(null);
    setSourceHint(null);
    setFileLoading(true);
    try {
      apply(await file.text(), file.name);
    } catch {
      setSourceHint(`Could not read ${file.name}. Try another file.`);
    } finally {
      setFileLoading(false);
    }
  };

  const jumpUnresolved = () => {
    if (!review) return;
    let index = coordinator.firstUnresolvedIndex(review);
    if (index < 0) {
      const firstIssueLine = reviewMeasurementIssues(review).find(
        (issue) => issue.lineIndex != null,
      )?.lineIndex;
      if (firstIssueLine != null) index = firstIssueLine;
    }
    if (index < 0) return;
    document
      .querySelector(`[data-unresolved]:nth-child(${index + 1})`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  /** Builds the durable source input from the editor's current inputs. */
  const buildSourceInput = (
    state: ComponentImportReviewState,
  ): ComponentImportSourceInput => {
    if (state.sourceKind === "csv_bundle") {
      return {
        kind: "csv_bundle",
        filename: sheetFilename,
        rawText: sheetCsv,
        csvSheetText: sheetCsv,
        csvLinesText: linesCsv,
      };
    }
    if (state.sourceKind === "text_file") {
      return {
        kind: "text_file",
        filename: textFilename,
        rawText: source,
      };
    }
    return { kind: "pasted_text", rawText: source };
  };

  /**
   * Persists the review through the governed transaction: create on first
   * save (the URL gains ?importId= so the review is reopenable), then
   * revision-checked saves. Failures keep every entered value.
   */
  const persistReview = async (
    state: ComponentImportReviewState,
  ): Promise<ComponentImportReviewState | null> => {
    setSaveState("saving");
    announce("Saving review…");
    try {
      if (state.importId == null) {
        const sourceInput = buildSourceInput(state);
        const result = await repositoryRef.current!.create(state, sourceInput);
        const next: ComponentImportReviewState = {
          ...state,
          importId: result.importId,
          reviewRevision: result.reviewRevision,
          rawSourceText: sourceInput.rawText,
          csvSheetText: sourceInput.csvSheetText,
          csvLinesText: sourceInput.csvLinesText,
          lines: state.lines.map((line, index) => ({
            ...line,
            importLineId: result.lineIds[index],
          })),
        };
        setReview(next);
        markClean();
        setSaveState("saved");
        setSearchParams({ importId: result.importId }, { replace: true });
        announce("Review saved. Reopen it from this page's address.");
        return next;
      }
      const result = await repositoryRef.current!.save(
        state,
        state.reviewRevision ?? 0,
      );
      const next: ComponentImportReviewState = {
        ...state,
        reviewRevision: result.reviewRevision,
      };
      setReview(next);
      markClean();
      setSaveState("saved");
      announce("Review saved.");
      return next;
    } catch (error) {
      const message = String(
        (error as Error | undefined)?.message ?? error ?? "",
      );
      if (/stale review revision/.test(message)) {
        setSaveState("conflict");
        setConflictNotice(
          "This review was saved by someone else. Your edits are kept — reload the saved version or review your changes before retrying.",
        );
        announce("Save conflict. Your edits are kept.");
      } else {
        setSaveState("failed");
        setFailure(error);
        announce("Save failed. Your edits are kept — retry when ready.");
      }
      return null;
    }
  };

  const reloadStored = () => {
    const mapped = mappedRef.current;
    if (!mapped) return;
    repositoryRef.current?.adopt(mapped);
    setReview(mapped);
    markClean();
    setConflictNotice(null);
    setSaveState("idle");
    announce("Reloaded the saved review.");
  };

  const finalize = async () => {
    if (!review || busy || !reviewIsReady(review)) return;
    setFailure(null);
    setBusy(true);
    announce("Saving your import…");
    try {
      let current = review;
      // A durable review finalizes exactly what storage holds, so unsaved
      // edits are persisted first; a failed save stops finalize honestly.
      if (current.importId != null && dirtyRef.current) {
        const saved = await persistReview(current);
        if (!saved) {
          setBusy(false);
          return;
        }
        current = saved;
      }
      const finalizer = new ComponentImportFinalizer({
        importComponent: (input) => importComponent(input as never),
        createIngredient: (input) =>
          createIngredient(input) as Promise<{ docId: string }>,
        createComponent: (input) =>
          createComponent(input) as Promise<{ docId: string }>,
        createComponentIngredient: (input) =>
          createComponentIngredient(input) as Promise<{ docId: string }>,
      });
      const scope = "component-import";
      const pending = beginPendingOperation(scope, current);
      const saved = await finalizer.finalize(pending.payload, pending.key);
      confirmPendingOperation(scope);
      const outcome = componentImportOutcome({
        ...saved,
        recovered: saved.recovered === true,
      });
      if (outcome.notice) {
        setRecoveryNotice(outcome.notice);
        setRecoveredComponentId(outcome.recoveredId);
        announce(outcome.notice);
      } else announce("Import completed.");
      if (outcome.navigateToId) navigate(componentPath(outcome.navigateToId));
    } catch (error) {
      setFailure(error);
      announce("Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const durableSession = importIdParam != null;
  const loadedForParam = review?.importId === importIdParam;
  const importLoading =
    durableSession &&
    importIdUsable &&
    (storedImport === undefined || storedLines === undefined) &&
    !loadedForParam;
  const importMissing =
    durableSession &&
    (!importIdUsable || (storedImport === null && !loadedForParam));
  const importCompleted =
    storedImport != null && storedImport.status === "completed";

  return (
    <div className="component-book-stage component-import-page culinary-studio">
      <KitchenBookNav />
      <header className="component-import-header">
        <div>
          <p className="eyebrow">Culinary book · Import</p>
          <h1 className="display-title mt-2">Component import</h1>
          <p className="mt-3 max-w-150 text-ink-2">
            Paste text or upload `.txt` / CSV exports, review ingredient
            matches, then save through generated commands.
          </p>
        </div>
        <div className="component-import-actions">
          <Link to="/kitchen/components" className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </header>

      <div ref={liveRef} className="sr-only" aria-live="polite">
        {statusMessage}
      </div>

      {failure ? (
        <div className="mt-4">
          <CulinaryFailureBanner error={failure} />
        </div>
      ) : null}
      {recoveryNotice ? (
        <p className="mt-4 text-base text-warn" role="status">
          {recoveryNotice}{" "}
          {recoveredComponentId ? (
            <Link to={componentPath(recoveredComponentId)} className="link">
              Open saved component
            </Link>
          ) : null}
        </p>
      ) : null}

      {importMissing ? (
        <section
          className="component-import-empty"
          aria-label="Import unavailable"
        >
          <p className="eyebrow">Not available</p>
          <h3 className="font-display text-2xl">
            This saved import cannot be opened.
          </h3>
          <p>
            It does not exist, or your kitchen does not have access to it. Start
            a new import below.
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setSearchParams({})}
          >
            Start a new import
          </button>
        </section>
      ) : importLoading ? (
        <div
          className="component-import-empty"
          role="status"
          aria-label="Loading saved review"
        >
          <p className="eyebrow">Loading</p>
          <h3 className="font-display text-2xl">Loading saved review…</h3>
        </div>
      ) : (
        <>
          <div
            className="component-import-mobile-tabs"
            role="tablist"
            aria-label="Import panes"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mobilePane === "source"}
              className={mobilePane === "source" ? "is-active" : undefined}
              onClick={() => setMobilePane("source")}
            >
              Source
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobilePane === "review"}
              className={mobilePane === "review" ? "is-active" : undefined}
              onClick={() => setMobilePane("review")}
            >
              Review
            </button>
          </div>

          <div className="component-import-split">
            <div
              className={
                mobilePane === "review"
                  ? "component-import-mobile-hidden"
                  : undefined
              }
            >
              {durableSession && review ? (
                <ComponentImportSourcePanel
                  kind={review.sourceKind}
                  filename={review.sourceFilename}
                  rawText={review.rawSourceText ?? ""}
                  csvSheetText={review.csvSheetText}
                  csvLinesText={review.csvLinesText}
                  importId={review.importId}
                  status={
                    storedImport == null ? undefined : storedImport.status
                  }
                />
              ) : (
                <ComponentImportSourcePane
                  mode={sourceMode}
                  source={source}
                  sheetCsv={sheetCsv}
                  linesCsv={linesCsv}
                  sheetFilename={sheetFilename}
                  linesFilename={linesFilename}
                  textFilename={textFilename}
                  parsing={parsing}
                  fileLoading={fileLoading}
                  canParse={readiness.ready}
                  sourceHint={displayHint}
                  fileStatus={fileStatus}
                  onModeChange={(mode) => {
                    setSourceMode(mode);
                    setSourceHint(null);
                  }}
                  onSourceChange={(value) => {
                    setSource(value);
                    setSourceHint(null);
                  }}
                  onSheetChange={(value, filename) => {
                    setSheetCsv(value);
                    setSheetFilename(filename);
                    setSourceHint(null);
                  }}
                  onLinesChange={(value, filename) => {
                    setLinesCsv(value);
                    setLinesFilename(filename);
                    setSourceHint(null);
                  }}
                  onTextFileChange={(value, filename) => {
                    setSource(value);
                    setTextFilename(filename);
                    setSourceHint(null);
                  }}
                  onLoadFile={(file, apply) => void loadFile(file, apply)}
                  onParse={parseSource}
                />
              )}
            </div>
            <div
              className={
                mobilePane === "source"
                  ? "component-import-mobile-hidden"
                  : undefined
              }
            >
              {importCompleted ? (
                <section
                  className="component-import-pane component-import-pane-review"
                  aria-label="Completed import"
                >
                  <div className="component-import-empty">
                    <p className="eyebrow">Completed</p>
                    <h3 className="font-display text-2xl">
                      This import is complete.
                    </h3>
                    <p>
                      The corrected formula lives on its component. The original
                      source stays readable beside it.
                    </p>
                    {storedImport?.resultingComponentId ? (
                      <Link
                        className="btn btn-primary"
                        to={componentPath(
                          String(storedImport.resultingComponentId),
                        )}
                      >
                        Open component
                      </Link>
                    ) : null}
                  </div>
                </section>
              ) : (
                <ComponentImportReviewPane
                  review={review}
                  coordinator={coordinator}
                  catalog={catalog}
                  busy={busy}
                  unresolvedCount={unresolvedCount}
                  saveState={saveState}
                  dirty={dirty}
                  conflictNotice={conflictNotice}
                  onReviewChange={handleReviewChange}
                  onJumpUnresolved={jumpUnresolved}
                  onFinalize={() => void finalize()}
                  onSaveReview={() => {
                    const current = reviewRef.current ?? review;
                    if (current) void persistReview(current);
                  }}
                  onReloadSaved={reloadStored}
                />
              )}
            </div>
          </div>
        </>
      )}

      {!durableSession ? (
        <section
          className="component-import-pane component-import-resumable"
          aria-label="Saved reviews in progress"
        >
          <div className="component-import-pane-head">
            <h2>Saved reviews in progress</h2>
            <span className="component-import-badge">
              {resumableImports.length}
            </span>
          </div>
          {allImports === undefined ? (
            <p role="status" className="font-mono text-xs text-ink-3">
              Loading saved reviews…
            </p>
          ) : resumableImports.length === 0 ? (
            <p className="text-sm text-ink-2">
              No saved reviews in progress. Parse a source and save it to resume
              it here later.
            </p>
          ) : (
            <ul className="component-import-resume-list">
              {resumableImports.map((row) => (
                <li key={row._id}>
                  <span className="component-import-resume-name">
                    {row.parsedName || row.sourceFilename || "Untitled import"}
                  </span>
                  <span className="component-import-badge">
                    {IMPORT_STATUS_LABELS[row.status] ?? row.status}
                  </span>
                  <Link
                    className="btn btn-ghost"
                    to={`${COMPONENT_IMPORT_PATH}?importId=${row._id}`}
                  >
                    Resume
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
