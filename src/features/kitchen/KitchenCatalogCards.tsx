import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AllergenIconRow } from "./AllergenIconRow";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { CulinaryCatalogCardCopy } from "./culinary-studio/CulinaryCatalogCardCopy";
import { CulinaryCatalogCardTone } from "./culinary-studio/CulinaryCatalogCardTone";
import "./culinary-studio/CulinaryCatalogCards.css";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";
import { KitchenCatalogLifecycleButtons } from "./KitchenCatalogLifecycleButtons";
import { formatStatusLabel } from "../../lib/statusLabels";
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
        <li
          key={item._id}
          className={CulinaryCatalogCardTone.cardClass(section)}
          style={{ ["--delay" as string]: `${Math.min(index, 12) * 35}ms` }}
        >
          <CardBody section={section} item={item} index={index} />
          <div className="culinary-card-actions">
            <KitchenCatalogLifecycleButtons
              section={section}
              item={item}
              busy={busy}
              run={run}
              showHidden={showHidden}
              commands={commands}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function CardBody({
  section,
  item,
  index,
}: Readonly<{
  section: KitchenSection;
  item: CatalogItem;
  index: number;
}>) {
  const description = CulinaryCatalogCardCopy.description(item);
  const showFallback = !description;

  return wrapCardLink(
    section,
    item._id,
    <>
      <div className="culinary-card-kicker">
        <span className="culinary-card-kind">
          {CulinaryCatalogCardTone.kindLabel(section)}
        </span>
        <span
          className={CulinaryCatalogCardTone.statusClass(String(item.status))}
        >
          {formatStatusLabel(String(item.status))}
        </span>
      </div>

      <CardMedia section={section} item={item} index={index} />

      <div>
        <h3 className="culinary-card-title">{item.name}</h3>
        <p
          className={
            showFallback ? "culinary-card-desc is-empty" : "culinary-card-desc"
          }
        >
          {description || CulinaryCatalogCardCopy.fallbackHint(section, item)}
        </p>
        {section === "dishes" ? (
          <AllergenIconRow codes={item.allergenSummary} className="mt-2" />
        ) : null}
      </div>

      <CardMetaChips section={section} item={item} />

      <div className="culinary-card-foot">
        <span className="culinary-card-version">Edition v{item.version}</span>
        <span className="culinary-card-open" aria-hidden="true">
          Open →
        </span>
      </div>
    </>,
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
          size="thumb"
          className="rounded-[10px]"
        />
      </div>
    );
  }

  return (
    <div className="culinary-card-media">
      <span className="culinary-card-glyph" aria-hidden="true">
        {CulinaryCatalogCardCopy.glyph(section, index)}
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
  return (
    <div className="culinary-card-meta">
      {item.category ? <span>{item.category}</span> : null}
      {section === "ingredients" && item.unit ? (
        <span className="is-unit">{String(item.unit)}</span>
      ) : null}
      {section === "dishes" && item.course ? <span>{item.course}</span> : null}
      {section === "menus" && item.isTemplate ? (
        <span className="is-flag">Template</span>
      ) : null}
      {section === "components" && item.cuisine ? (
        <span>{item.cuisine}</span>
      ) : null}
    </div>
  );
}

function wrapCardLink(
  section: KitchenSection,
  id: string,
  body: ReactNode,
): ReactNode {
  if (section === "ingredients") {
    return (
      <CulinaryEntityLink
        className="culinary-card-link"
        kind="ingredient"
        id={id}
      >
        {body}
      </CulinaryEntityLink>
    );
  }

  return (
    <Link className="culinary-card-link" to={catalogPath(section, id)}>
      {body}
    </Link>
  );
}

function catalogPath(section: KitchenSection, id: string): string {
  if (section === "components") return componentPath(id);
  if (section === "dishes") return dishPath(id);
  return menuPath(id);
}
