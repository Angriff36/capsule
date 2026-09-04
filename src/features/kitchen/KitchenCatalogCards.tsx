import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { formatMoneyExact } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import { ChevronRightIcon } from "../../ui/icons";
import { RecordPreviewSheet } from "../../ui/RecordPreviewSheet";
import { useVirtualWindow } from "../../ui/useVirtualWindow";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";
import { AllergenIconRow } from "./AllergenIconRow";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { KitchenCatalogLifecycleButtons } from "./KitchenCatalogLifecycleButtons";
import { CulinaryCatalogCardCopy } from "./culinary-studio/CulinaryCatalogCardCopy";
import { CulinaryCatalogCardTone } from "./culinary-studio/CulinaryCatalogCardTone";
import "./culinary-studio/CulinaryCatalogCards.css";
import {
  componentPath,
  dishPath,
  menuPath,
  type KitchenSection,
} from "./kitchenRoutes";

export type CatalogItem = {
  _id: string;
  name: string;
  status: string;
  version: number;
  description?: string | null;
  category?: string | null;
  cuisine?: string | null;
  unit?: string | null;
  costPerUnit?: number | null;
  course?: string | null;
  isTemplate?: boolean | null;
  primaryImageStorageId?: string | null;
  allergenSummary?: string[] | null;
  deletedAt?: number | null;
  editionNumber?: number | null;
  canonicalDishId?: string | null;
  canonicalIngredientId?: string | null;
  mergedIntoDishId?: string | null;
  mergedIntoIngredientId?: string | null;
};

type LifecycleCommands = {
  purgeIngredient: (args: Record<string, unknown>) => Promise<unknown>;
  reinstateIngredient: (args: Record<string, unknown>) => Promise<unknown>;
  purgeDish: (args: Record<string, unknown>) => Promise<unknown>;
  reinstateDish: (args: Record<string, unknown>) => Promise<unknown>;
  purgeComponent: (args: Record<string, unknown>) => Promise<unknown>;
  publishMenu: (args: Record<string, unknown>) => Promise<unknown>;
  unpublishMenu: (args: Record<string, unknown>) => Promise<unknown>;
  archiveMenu: (args: Record<string, unknown>) => Promise<unknown>;
  restoreMenu: (args: Record<string, unknown>) => Promise<unknown>;
};

type CategoryOption = {
  value: string;
  label: string;
  count: number;
};

type Props = Readonly<{
  section: KitchenSection;
  rows: CatalogItem[];
  categories: CategoryOption[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  busy: string | null;
  showHidden: boolean;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
  commands: LifecycleCommands;
}>;

const ROW_HEIGHT = 68;

/**
 * Virtualized culinary index. Only the visible ledger rows mount; the one
 * selected record gets the richer image and lifecycle surface in its preview.
 */
export function KitchenCatalogCards({
  section,
  rows,
  categories,
  activeCategory,
  onCategoryChange,
  busy,
  showHidden,
  run,
  commands,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => rows.find((row) => row._id === selectedId) ?? null,
    [rows, selectedId],
  );
  const closePreview = useCallback(() => setSelectedId(null), []);
  const { scrollRef, virtualRows, totalHeight, onScroll } = useVirtualWindow({
    count: rows.length,
    rowHeight: ROW_HEIGHT,
  });

  useEffect(() => {
    setSelectedId(null);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeCategory, rows, scrollRef, section]);

  return (
    <>
      <div className="culinary-index-layout">
        <nav className="culinary-category-index" aria-label="Categories">
          <p>Category</p>
          {categories.map((category) => (
            <button
              key={category.value}
              type="button"
              aria-current={
                category.value === activeCategory ? "page" : undefined
              }
              onClick={() => onCategoryChange(category.value)}
            >
              <span>{category.label}</span>
              <span>{category.count.toLocaleString()}</span>
            </button>
          ))}
        </nav>

        <div className="culinary-catalog-ledger">
          <div
            role="table"
            aria-label={`${section} catalog`}
            aria-rowcount={rows.length + 1}
          >
            <div className="culinary-ledger-header" role="row">
              <span role="columnheader">Name</span>
              <span role="columnheader">Category</span>
              <span role="columnheader">Details</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Edition</span>
              <span role="columnheader" aria-label="Preview" />
            </div>
            <div
              ref={scrollRef}
              className="culinary-ledger-scroll"
              role="rowgroup"
              style={{
                height: `${Math.min(584, Math.max(ROW_HEIGHT, totalHeight))}px`,
              }}
              onScroll={onScroll}
            >
              <div
                className="culinary-ledger-window"
                role="presentation"
                style={{ height: `${totalHeight}px` }}
              >
                {virtualRows.map(({ index, offset }) => {
                  const item = rows[index];
                  return (
                    <div
                      key={item._id}
                      className="culinary-ledger-row"
                      role="row"
                      aria-rowindex={index + 2}
                      aria-selected={item._id === selectedId || undefined}
                      tabIndex={0}
                      style={{
                        height: `${ROW_HEIGHT}px`,
                        transform: `translateY(${offset}px)`,
                      }}
                      onClick={() => setSelectedId(item._id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(item._id);
                        }
                      }}
                    >
                      <span className="culinary-ledger-name" role="cell">
                        <strong>{item.name}</strong>
                        <small>{ledgerDescription(section, item)}</small>
                      </span>
                      <span className="culinary-ledger-category" role="cell">
                        {item.category || "Uncategorized"}
                      </span>
                      <span className="culinary-ledger-detail" role="cell">
                        {ledgerDetail(section, item)}
                      </span>
                      <span role="cell">
                        <span
                          className={`culinary-ledger-status ${CulinaryCatalogCardTone.statusClass(String(item.status))}`}
                        >
                          {formatStatusLabel(String(item.status))}
                        </span>
                      </span>
                      <span className="culinary-ledger-version" role="cell">
                        v{item.version}
                      </span>
                      <span className="culinary-ledger-open" role="cell">
                        <ChevronRightIcon />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <footer className="culinary-ledger-footer">
            <span>{rows.length.toLocaleString()} matching records</span>
            <span>Select a row to preview</span>
          </footer>
        </div>
      </div>

      <RecordPreviewSheet
        open={selected != null}
        title={selected?.name ?? "Record"}
        description={
          selected ? ledgerDescription(section, selected) : undefined
        }
        label={`${CulinaryCatalogCardTone.kindLabel(section)} preview`}
        onClose={closePreview}
        footer={
          selected ? (
            <>
              {recordLink(
                section,
                selected._id,
                "Open full record",
                "btn btn-primary",
              )}
              <KitchenCatalogLifecycleButtons
                section={section}
                item={selected}
                busy={busy}
                run={run}
                showHidden={showHidden}
                commands={commands}
              />
            </>
          ) : null
        }
      >
        {selected ? <CatalogPreview section={section} item={selected} /> : null}
      </RecordPreviewSheet>
    </>
  );
}

function CatalogPreview({
  section,
  item,
}: Readonly<{ section: KitchenSection; item: CatalogItem }>) {
  const facts = previewFacts(section, item);
  return (
    <div className="culinary-preview">
      {section === "dishes" || section === "ingredients" ? (
        <div className="culinary-preview-image">
          <DishPrimaryImage
            storageId={item.primaryImageStorageId}
            alt={item.name}
            size="hero"
          />
        </div>
      ) : null}

      <div className="culinary-preview-state">
        <span
          className={`culinary-ledger-status ${CulinaryCatalogCardTone.statusClass(String(item.status))}`}
        >
          {formatStatusLabel(String(item.status))}
        </span>
        <span>{CulinaryCatalogCardTone.kindLabel(section)}</span>
      </div>

      <section className="culinary-preview-section">
        <h3>Record details</h3>
        <dl>
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {item.description?.trim() ? (
        <section className="culinary-preview-section">
          <h3>Description</h3>
          <p>{item.description.trim()}</p>
        </section>
      ) : null}

      {item.allergenSummary ? (
        <section className="culinary-preview-section">
          <h3>Allergens</h3>
          <AllergenIconRow codes={item.allergenSummary} />
        </section>
      ) : null}
    </div>
  );
}

function previewFacts(section: KitchenSection, item: CatalogItem) {
  const facts: { label: string; value: string }[] = [
    { label: "Category", value: item.category || "Uncategorized" },
    { label: "Edition", value: `v${item.version}` },
  ];
  if (section === "dishes" && item.course) {
    facts.push({ label: "Course", value: item.course });
  }
  if (section === "components" && item.cuisine) {
    facts.push({ label: "Cuisine", value: item.cuisine });
  }
  if (section === "ingredients") {
    facts.push({ label: "Unit", value: item.unit || "Unit" });
    if (item.costPerUnit != null) {
      facts.push({
        label: "Cost",
        value: `${formatMoneyExact(Number(item.costPerUnit))} per ${item.unit || "unit"}`,
      });
    }
  }
  if (section === "menus" && item.isTemplate) {
    facts.push({ label: "Menu type", value: "Template" });
  }
  return facts;
}

function ledgerDescription(section: KitchenSection, item: CatalogItem) {
  return (
    CulinaryCatalogCardCopy.description(item) ||
    CulinaryCatalogCardCopy.fallbackHint(section, item)
  );
}

function ledgerDetail(section: KitchenSection, item: CatalogItem) {
  if (section === "ingredients" && item.costPerUnit != null) {
    return `${formatMoneyExact(Number(item.costPerUnit))} / ${item.unit || "unit"}`;
  }
  if (section === "dishes") return item.course || "—";
  if (section === "components") return item.cuisine || "—";
  if (section === "menus") return item.isTemplate ? "Template" : "Menu";
  return "—";
}

function recordLink(
  section: KitchenSection,
  id: string,
  body: ReactNode,
  className?: string,
): ReactNode {
  if (section === "ingredients") {
    return (
      <CulinaryEntityLink className={className} kind="ingredient" id={id}>
        {body}
      </CulinaryEntityLink>
    );
  }
  return (
    <Link className={className} to={catalogPath(section, id)}>
      {body}
    </Link>
  );
}

function catalogPath(section: KitchenSection, id: string): string {
  if (section === "components") return componentPath(id);
  if (section === "dishes") return dishPath(id);
  return menuPath(id);
}
