import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AllergenIconRow } from "./AllergenIconRow";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { CulinaryCatalogCardCopy } from "./culinary-studio/CulinaryCatalogCardCopy";
import { CulinaryCatalogCardTone } from "./culinary-studio/CulinaryCatalogCardTone";
import "./culinary-studio/CulinaryCatalogCards.css";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";
import { KitchenCatalogLifecycleButtons } from "./KitchenCatalogLifecycleButtons";
import { formatMoneyExact } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import { ActionMenu } from "../../ui/primitives";
import {
  dishPath,
  menuPath,
  componentPath,
  type KitchenSection,
} from "./kitchenRoutes";

type CatalogItem = {
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

type Props = Readonly<{
  section: KitchenSection;
  rows: CatalogItem[];
  busy: string | null;
  showHidden: boolean;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
  commands: LifecycleCommands;
}>;

/**
 * Catalog grid: substantial white cards (1 / 2 / 3 / 4 per row), a real
 * image area on top, name + chips + cost, then one primary "Open" and an
 * overflow menu holding lifecycle actions (Delete last, in red).
 */
export function KitchenCatalogCards({
  section,
  rows,
  busy,
  showHidden,
  run,
  commands,
}: Props) {
  return (
    <ul className="culinary-card-grid">
      {rows.map((item, index) => (
        <li key={item._id} className="culinary-card card">
          <CardMedia section={section} item={item} index={index} />
          <div className="culinary-card-body">
            <div className="flex items-start justify-between gap-2">
              <h3 className="culinary-card-title">
                {wrapCardLink(section, item._id, item.name)}
              </h3>
              <span
                className={`chip ${CulinaryCatalogCardTone.statusClass(String(item.status))}`}
              >
                {formatStatusLabel(String(item.status))}
              </span>
            </div>
            <CardMetaChips section={section} item={item} />
            <p className="culinary-card-desc">
              {CulinaryCatalogCardCopy.description(item) ||
                CulinaryCatalogCardCopy.fallbackHint(section, item)}
            </p>
            {section === "dishes" ? (
              <AllergenIconRow codes={item.allergenSummary} className="mt-1" />
            ) : null}
            <CardCost section={section} item={item} />
          </div>
          <div className="culinary-card-actions">
            {wrapCardLink(section, item._id, "Open", "btn btn-primary btn-sm")}
            <span className="text-xs text-ink-2">v{item.version}</span>
            <KitchenCatalogLifecycleButtons
              section={section}
              item={item}
              busy={busy}
              run={run}
              showHidden={showHidden}
              commands={commands}
              render={(buttons) =>
                buttons ? <ActionMenu>{buttons}</ActionMenu> : null
              }
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function CardMedia({
  section,
  item,
  index,
}: Readonly<{
  section: KitchenSection;
  item: CatalogItem;
  index: number;
}>) {
  if (section === "dishes") {
    return (
      <div className="culinary-card-media">
        <DishPrimaryImage
          storageId={item.primaryImageStorageId}
          alt={item.name}
          size="card"
        />
      </div>
    );
  }
  return (
    <div className="culinary-card-media culinary-card-media-glyph">
      <span aria-hidden="true">
        {CulinaryCatalogCardCopy.glyph(section, index)}
      </span>
      <span className="text-xs font-medium text-ink-2">
        {CulinaryCatalogCardTone.kindLabel(section)}
      </span>
    </div>
  );
}

function CardMetaChips({
  section,
  item,
}: Readonly<{
  section: KitchenSection;
  item: CatalogItem;
}>) {
  const chips: string[] = [];
  if (item.category) chips.push(item.category);
  if (section === "dishes" && item.course) chips.push(item.course);
  if (section === "components" && item.cuisine) chips.push(item.cuisine);
  if (section === "menus" && item.isTemplate) chips.push("Template");
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <span
          key={chip}
          className="chip border-line-2 bg-inset text-ink-2 capitalize"
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

function CardCost({
  section,
  item,
}: Readonly<{ section: KitchenSection; item: CatalogItem }>) {
  if (section !== "ingredients" || item.costPerUnit == null) return null;
  return (
    <p className="mt-auto pt-1 text-sm text-ink-2">
      <span className="text-base font-semibold text-ink">
        {formatMoneyExact(Number(item.costPerUnit))}
      </span>{" "}
      per {item.unit ?? "unit"}
    </p>
  );
}

function wrapCardLink(
  section: KitchenSection,
  id: string,
  body: ReactNode,
  className = "culinary-card-link",
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
