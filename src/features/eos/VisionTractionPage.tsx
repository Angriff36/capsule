import { Link } from "react-router-dom";
import { formatDate, formatMoney } from "@/lib/format";
import { PageHeader, TableSkeleton } from "@/ui/primitives";
import { EosPanel, EosTabs, InlineText, useRun } from "./EosShared";
import { EOS_PATHS } from "./eosModel";
import {
  useCompanyVision,
  useEosViewer,
  useSaveVision,
  useVisionItems,
  type VisionFields,
} from "./useEosData";
import { VisionList } from "./VisionList";
import { RocksAndIssues } from "./RocksAndIssues";

function dayValue(ms: number | null | undefined): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function Block({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="eos-vto-block">
      <h3>
        {title}
        {hint ? <small>{hint}</small> : null}
      </h3>
      <div className="grid min-w-0 gap-2">{children}</div>
    </div>
  );
}

/**
 * The Vision/Traction Organizer as the book lays it out: two pages, Vision on
 * the left and Traction on the right. Every part is edited in place; the
 * quarter's Rocks and the issues come live from the L10.
 */
export function VisionTractionPage() {
  const vision = useCompanyVision();
  const items = useVisionItems();
  const { canEdit } = useEosViewer();
  const save = useSaveVision(vision);
  const { run, busy, banner } = useRun();

  if (vision === undefined || items === undefined) {
    return (
      <div className="operations-stage supply-stage">
        <EosTabs />
        <TableSkeleton rows={10} />
      </div>
    );
  }

  const text = (
    key: keyof VisionFields,
    label: string,
    placeholder: string,
    multiline = false,
  ) => (
    <div>
      <span className="eos-field-label">{label}</span>
      <InlineText
        value={String(vision?.[key] ?? "")}
        label={label}
        placeholder={placeholder}
        multiline={multiline}
        disabled={!canEdit}
        onSave={(next) => run(() => save({ [key]: next || null }))}
      />
    </div>
  );
  const date = (key: keyof VisionFields, label: string) => {
    const stored = vision?.[key] as number | null | undefined;
    return (
      <div>
        <span className="eos-field-label">{label}</span>
        <InlineText
          inputType="date"
          value={dayValue(stored)}
          display={stored != null ? formatDate(stored) : ""}
          label={label}
          placeholder="Pick a date"
          disabled={!canEdit}
          onSave={(next) =>
            run(() =>
              save({
                [key]: next ? new Date(`${next}T12:00:00`).getTime() : null,
              }),
            )
          }
        />
      </div>
    );
  };
  const money = (key: keyof VisionFields, label: string) => {
    const stored = vision?.[key] as number | null | undefined;
    return (
      <div>
        <span className="eos-field-label">{label}</span>
        <InlineText
          inputType="number"
          value={stored != null ? String(stored) : ""}
          display={stored != null ? formatMoney(stored) : ""}
          label={label}
          placeholder="Add amount"
          disabled={!canEdit}
          onSave={(next) =>
            run(() => save({ [key]: next === "" ? null : Number(next) }))
          }
        />
      </div>
    );
  };
  const list = {
    canEdit,
    run,
    busy,
    items,
  };

  return (
    <div className="operations-stage supply-stage">
      <EosTabs />
      <PageHeader
        eyebrow="EOS · Vision"
        title="Vision/Traction Organizer"
        lead={
          canEdit
            ? "Where Mangia is going and how it gets there, on two pages. Click any part to write or change it."
            : "Where Mangia is going and how it gets there, on two pages."
        }
        facts={
          vision?.revisedAt
            ? [{ label: "Last changed", value: formatDate(vision.revisedAt) }]
            : undefined
        }
        actions={
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => window.print()}
          >
            Print V/TO
          </button>
        }
      />
      {banner}
      <div className="eos-vto mt-5">
        <EosPanel
          tone="vision"
          eyebrow="Page 1"
          title="Vision"
          bodyClassName=""
        >
          <Block title="Core values" hint="3 to 7 · who we are">
            <VisionList
              {...list}
              section="core_value"
              placeholder="Core value"
              detailPlaceholder="What it looks like at Mangia"
              limitHint={
                items.filter((row) => row.section === "core_value").length > 7
                  ? "The book keeps it to 3 to 7 values."
                  : undefined
              }
            />
          </Block>
          <Block title="Core focus" hint="why we exist · what we do best">
            {text(
              "coreFocusPurpose",
              "Purpose / cause / passion",
              "Why Mangia exists",
            )}
            {text("coreFocusNiche", "Our niche", "What Mangia does best")}
          </Block>
          <Block title="10-year target" hint="one big goal">
            {text(
              "tenYearTarget",
              "Target",
              "e.g. $10M in catering a year",
              true,
            )}
            {date("tenYearDate", "By")}
          </Block>
          <Block title="Marketing strategy">
            {text(
              "targetMarket",
              "Target market (“the list”)",
              "Who our ideal client is",
              true,
            )}
            <div>
              <span className="eos-field-label">Three uniques</span>
              <VisionList
                {...list}
                section="differentiator"
                placeholder="What sets us apart"
                limitHint={
                  items.filter((row) => row.section === "differentiator")
                    .length > 3
                    ? "The book keeps it to three."
                    : undefined
                }
              />
            </div>
            {text(
              "provenProcess",
              "Proven process",
              "The steps every client goes through, named",
              true,
            )}
            {text("guarantee", "Guarantee", "What we promise every client")}
          </Block>
          <Block title="3-year picture">
            <div className="eos-facts">
              {date("threeYearDate", "Future date")}
              {money("threeYearRevenue", "Revenue")}
              {money("threeYearProfit", "Profit")}
            </div>
            {text(
              "threeYearMeasurables",
              "Measurables",
              "e.g. 600 events a year",
              true,
            )}
            <div>
              <span className="eos-field-label">What does it look like?</span>
              <VisionList
                {...list}
                section="three_year"
                placeholder="What it looks like"
              />
            </div>
          </Block>
        </EosPanel>

        <EosPanel
          tone="traction"
          eyebrow="Page 2"
          title="Traction"
          bodyClassName=""
        >
          <Block title="1-year plan">
            <div className="eos-facts">
              {date("oneYearDate", "Future date")}
              {money("oneYearRevenue", "Revenue")}
              {money("oneYearProfit", "Profit")}
            </div>
            {text("oneYearMeasurables", "Measurables", "e.g. 250 events", true)}
            <div>
              <span className="eos-field-label">Goals for the year</span>
              <VisionList
                {...list}
                section="one_year_goal"
                placeholder="Goal for the year"
                checkable
                limitHint="3 to 7 goals. Tick each one when it is done."
              />
            </div>
          </Block>
          <Block title="Rocks" hint="this quarter">
            <div className="eos-facts">
              {date("quarterDate", "Future date")}
              {money("quarterRevenue", "Revenue")}
              {money("quarterProfit", "Profit")}
            </div>
            {text("quarterMeasurables", "Measurables", "e.g. 60 events", true)}
            <RocksAndIssues part="rocks" />
          </Block>
          <Block title="Issues list" hint="long-term">
            <RocksAndIssues part="issues" />
          </Block>
        </EosPanel>
      </div>
      <p className="mt-4 text-sm text-ink-3">
        Rocks and weekly issues are worked in the{" "}
        <Link to={EOS_PATHS.l10} className="btn-link">
          L10 meeting
        </Link>
        . Long-term issues wait here until the team brings them into a meeting.
      </p>
    </div>
  );
}
