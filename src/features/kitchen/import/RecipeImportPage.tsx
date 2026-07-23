import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  useCreateIngredient,
  useCreateRecipe,
  useCreateRecipeIngredient,
  useListIngredient,
} from "../../../lib/manifest-convex-react";
import { CulinaryFailureBanner } from "../CulinaryFailureBanner";
import { KitchenBookNav } from "../KitchenBookNav";
import { recipePath } from "../kitchenRoutes";
import { RecipeImportCoordinator } from "./RecipeImportCoordinator";
import { RecipeImportFinalizer } from "./RecipeImportFinalizer";
import {
  ImportSourceReadinessChecker,
  type ImportSourceMode,
} from "./ImportSourceReadiness";
import {
  RecipeImportReviewPane,
  RecipeImportSourcePane,
} from "./RecipeImportPanes";
import {
  countUnresolvedLines,
  reviewIsReady,
  type RecipeImportReviewState,
} from "./RecipeImportTypes";

const coordinator = new RecipeImportCoordinator();
const sourceReadiness = new ImportSourceReadinessChecker();

type MobilePane = "source" | "review";

export function RecipeImportPage() {
  const navigate = useNavigate();
  const liveRef = useRef<HTMLDivElement>(null);
  const ingredients = useListIngredient();
  const createIngredient = useCreateIngredient();
  const createRecipe = useCreateRecipe();
  const createRecipeIngredient = useCreateRecipeIngredient();
  const [mobilePane, setMobilePane] = useState<MobilePane>("source");
  const [sourceMode, setSourceMode] = useState<ImportSourceMode>("paste");
  const [source, setSource] = useState("");
  const [sheetCsv, setSheetCsv] = useState("");
  const [linesCsv, setLinesCsv] = useState("");
  const [sheetFilename, setSheetFilename] = useState<string>();
  const [linesFilename, setLinesFilename] = useState<string>();
  const [textFilename, setTextFilename] = useState<string>();
  const [fileLoading, setFileLoading] = useState(false);
  const [review, setReview] = useState<RecipeImportReviewState | null>(null);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sourceHint, setSourceHint] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [statusMessage, setStatusMessage] = useState("");

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

  const parseSource = () => {
    if (parsing || busy) return;
    setFailure(null);
    if (!readiness.ready) {
      setSourceHint(readiness.message ?? "Add source input before parsing.");
      announce(readiness.message ?? "Add source input before parsing.");
      return;
    }
    setSourceHint(null);
    setParsing(true);
    try {
      let next: RecipeImportReviewState;
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
          textFilename ?? "recipe.txt",
          catalog,
        );
      } else {
        next = coordinator.parseText(source, catalog, "pasted_text");
      }
      setReview(next);
      setMobilePane("review");
      announce(
        `Parsed ${next.lines.length} ingredient lines with ${countUnresolvedLines(next.lines)} unresolved matches.`,
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
    const index = coordinator.firstUnresolvedIndex(review);
    if (index < 0) return;
    document
      .querySelector(`[data-unresolved]:nth-child(${index + 1})`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const finalize = async () => {
    if (!review || busy || !reviewIsReady(review)) return;
    setFailure(null);
    setBusy(true);
    announce("Finalizing import through generated commands.");
    try {
      const finalizer = new RecipeImportFinalizer({
        createIngredient: (input) =>
          createIngredient(input) as Promise<{ docId: string }>,
        createRecipe: (input) =>
          createRecipe(input) as Promise<{ docId: string }>,
        createRecipeIngredient: (input) =>
          createRecipeIngredient(input) as Promise<{ docId: string }>,
      });
      const saved = await finalizer.finalize(review);
      announce("Import completed.");
      navigate(recipePath(saved.recipeId));
    } catch (error) {
      setFailure(error);
      announce("Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="recipe-book-stage recipe-import-page culinary-studio">
      <KitchenBookNav />
      <header className="recipe-import-header">
        <div>
          <p className="eyebrow">Culinary book · Import</p>
          <h1 className="display-title mt-2">Recipe import</h1>
          <p className="mt-3 max-w-150 text-ink-2">
            Paste text or upload `.txt` / CSV exports, review ingredient
            matches, then save through generated commands.
          </p>
        </div>
        <div className="recipe-import-actions">
          <Link to="/kitchen/recipes" className="btn btn-ghost">
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

      <div
        className="recipe-import-mobile-tabs"
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

      <div className="recipe-import-split">
        <div
          className={
            mobilePane === "review" ? "recipe-import-mobile-hidden" : undefined
          }
        >
          <RecipeImportSourcePane
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
        </div>
        <div
          className={
            mobilePane === "source" ? "recipe-import-mobile-hidden" : undefined
          }
        >
          <RecipeImportReviewPane
            review={review}
            coordinator={coordinator}
            catalog={catalog}
            busy={busy}
            unresolvedCount={unresolvedCount}
            onReviewChange={setReview}
            onJumpUnresolved={jumpUnresolved}
            onFinalize={() => void finalize()}
          />
        </div>
      </div>
    </div>
  );
}
