import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreatePlanningRule,
  useEquipmentSetOperatingFacts,
  useListEquipment,
  useListOrganization,
  useListPlanningRule,
  useListVehicle,
  useOrganizationConfigurePlanningChecks,
  usePlanningRuleReinstate,
  usePlanningRuleRetire,
  usePlanningRuleRevise,
  useVehicleSetCrewFacts,
} from "../../../lib/manifest-convex-react";
import {
  needsFromText,
  needsJson,
  needsToText,
  parseNeeds,
  parseSupplies,
  suppliesFromText,
  suppliesJson,
  suppliesToText,
} from "../../../lib/planningCapabilities";
import {
  parsePlanLevels,
  PLAN_CHECKS,
  planLevelsJson,
  rigName,
  type PlanCheck,
  type PlanLevel,
  type PlanLevels,
} from "../../../lib/planningChecks";
import {
  parseRuleActions,
  ruleActionsJson,
  ruleAmountText,
  RULE_ACTION_KINDS,
  type RuleAction,
} from "../../../lib/planningRules";
import { useAuthStatus } from "../../../lib/useAuthStatus";
import {
  EmptyState,
  PageHeader,
  StatusChip,
  TableSkeleton,
} from "../../../ui/primitives";
import { useSuccessToast } from "../../../ui/useSuccessToast";
import { resolveManifestPolicies } from "../../admin/rolePermissionAudit";
import { classifyCommandFailure, type CommandFailure } from "../CommandFailure";
import { FailureBanner } from "../FailureBanner";

const LEVEL_LABEL: Record<PlanLevel, string> = {
  fix: "Fix first",
  look: "Worth a look",
  off: "Off",
};

const TRIGGERS = [
  { value: "every_event", label: "Every event" },
  { value: "equipment", label: "When this equipment is on the event" },
  {
    value: "equipment_kind",
    label: "When any equipment of this kind is on the event",
  },
] as const;

type RuleDraft = {
  id: string | null;
  version?: number;
  name: string;
  trigger: string;
  triggerEquipmentId: string;
  triggerEquipmentKind: string;
  actions: RuleAction[];
};

const emptyAction = (): RuleAction => ({
  kind: "equipment",
  target: "",
  base: 0,
  perGuest: 0,
  perTrigger: 1,
});

const emptyRule = (): RuleDraft => ({
  id: null,
  name: "",
  trigger: "equipment",
  triggerEquipmentId: "",
  triggerEquipmentKind: "",
  actions: [emptyAction()],
});

/**
 * Planning setup: how loud each planning check is, the rules that suggest
 * what else an event needs, each truck's seats and driver certificate, and
 * what each piece of equipment needs and gives (power, fuel, water).
 */
export function PlanningSetupPage() {
  const authStatus = useAuthStatus();
  const organizations = useListOrganization();
  const organization = organizations?.find((row) => row.deletedAt == null);
  const loading = organizations === undefined;
  const levels = parsePlanLevels(organization?.planningChecksJson);
  const rules = useListPlanningRule();
  const equipment = useListEquipment();
  const vehicles = useListVehicle();
  const saveChecks = useOrganizationConfigurePlanningChecks();
  const defineRule = useCreatePlanningRule();
  const reviseRule = usePlanningRuleRevise();
  const retireRule = usePlanningRuleRetire();
  const reinstateRule = usePlanningRuleReinstate();
  const setCrewFacts = useVehicleSetCrewFacts();
  const setOperatingFacts = useEquipmentSetOperatingFacts();

  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null);
  const [equipmentFind, setEquipmentFind] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const { notifySuccess, host: savedToast } = useSuccessToast();

  const permissions = new Set(resolveManifestPolicies(authStatus?.role ?? ""));
  const has = (...caps: string[]) => caps.some((cap) => permissions.has(cap));
  const canChecks = has("manageAccess");
  const canRules = has("eventManageAccess", "logisticsAccess", "manageAccess");
  const canTrucks = has("logisticsAccess", "manageAccess");
  const canEquipment = has("inventoryAccess", "logisticsAccess");

  const run = async (
    key: string,
    work: () => Promise<unknown>,
    ok: string,
  ): Promise<boolean> => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
      notifySuccess(ok);
      return true;
    } catch (error) {
      setFailure(classifyCommandFailure(error));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const liveEquipment = (equipment ?? [])
    .filter((row) => row.deletedAt == null && String(row.status) === "active")
    .sort((a, b) => a.name.localeCompare(b.name));
  const equipmentName = (id: string) =>
    (equipment ?? []).find((row) => row._id === id)?.name ??
    "Removed equipment";
  const kinds = [
    ...new Set(liveEquipment.map((row) => row.category).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const liveRules = (rules ?? [])
    .filter((row) => row.deletedAt == null)
    .sort(
      (a, b) =>
        Number(String(a.status) !== "active") -
          Number(String(b.status) !== "active") || a.name.localeCompare(b.name),
    );
  const trucks = (vehicles ?? [])
    .filter(
      (row) =>
        row.deletedAt == null && String(row.operationalStatus) !== "retired",
    )
    .sort((a, b) => rigName(a, "").localeCompare(rigName(b, "")));
  const needle = equipmentFind.trim().toLowerCase();
  const shownEquipment = liveEquipment.filter(
    (row) =>
      needle === "" ||
      `${row.name} ${row.category}`.toLowerCase().includes(needle) ||
      row.needsJson != null ||
      row.providesJson != null,
  );

  const submitChecks = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!organization) return;
    const data = new FormData(formEvent.currentTarget);
    const next = { ...levels } as PlanLevels;
    for (const check of PLAN_CHECKS) {
      const value = String(data.get(check.key));
      if (value === "fix" || value === "look" || value === "off")
        next[check.key as PlanCheck] = value;
    }
    void run(
      "checks",
      () =>
        saveChecks({
          docId: organization._id,
          version: organization.version,
          checksJson: planLevelsJson(next),
        }),
      "Checks saved",
    );
  };

  const submitRule = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!ruleDraft) return;
    // An every-event rule has nothing to count "for each one", and a to-do
    // is always one to-do.
    const actions = ruleDraft.actions
      .filter((action) => action.target.trim() !== "")
      .map((action) => ({
        ...action,
        target: action.target.trim(),
        base: action.kind === "task" ? 1 : action.base,
        perGuest: action.kind === "task" ? 0 : action.perGuest,
        perTrigger:
          action.kind === "task" || ruleDraft.trigger === "every_event"
            ? 0
            : action.perTrigger,
      }));
    const actionsJson = ruleActionsJson(actions);
    void run(
      "rule",
      () =>
        ruleDraft.id
          ? reviseRule({
              docId: ruleDraft.id,
              version: ruleDraft.version,
              name: ruleDraft.name.trim(),
              actionsJson,
            })
          : defineRule({
              name: ruleDraft.name.trim(),
              trigger: ruleDraft.trigger,
              actionsJson,
              triggerEquipmentId:
                ruleDraft.trigger === "equipment"
                  ? ruleDraft.triggerEquipmentId || undefined
                  : undefined,
              triggerEquipmentKind:
                ruleDraft.trigger === "equipment_kind"
                  ? ruleDraft.triggerEquipmentKind.trim() || undefined
                  : undefined,
            }),
      "Rule saved",
    ).then((saved) => {
      if (saved) setRuleDraft(null);
    });
  };

  const setAction = (index: number, patch: Partial<RuleAction>) =>
    setRuleDraft((draft) =>
      draft
        ? {
            ...draft,
            actions: draft.actions.map((action, at) =>
              at === index ? { ...action, ...patch } : action,
            ),
          }
        : draft,
    );

  const triggerText = (rule: (typeof liveRules)[number]) =>
    String(rule.trigger) === "every_event"
      ? "Every event"
      : String(rule.trigger) === "equipment"
        ? `When ${equipmentName(rule.triggerEquipmentId ?? "")} is on the event`
        : `When any ${rule.triggerEquipmentKind ?? "equipment"} is on the event`;

  return (
    <div className="operations-stage">
      <Link className="text-link" to="/events/tracker?view=plan">
        ← Planning board
      </Link>
      <PageHeader
        eyebrow="Events · Planning"
        title="Planning setup"
        lead="How the planning board checks a plan, what it suggests, and the facts it needs about trucks and equipment."
      />
      {savedToast}
      {failure ? <FailureBanner failure={failure} /> : null}

      <section className="mt-6" aria-label="Checks">
        <div className="section-rule">
          <span>Checks</span>
          <i />
          <em>How loud each one is</em>
        </div>
        <p className="mt-2 max-w-[72ch] text-base text-ink-2">
          No check here stops a save. “Fix first” asks for a reason where a
          reason can answer it (a person on two events, a power, fuel or water
          gap, a manager booking equipment that is out of service), and the
          reason is kept on the event. “Worth a look” only shows. “Off” hides
          it. Capsule’s own booking rules still apply: a truck can’t be on two
          runs at the same time, and a person on approved leave can’t be put on.
        </p>
        {loading ? (
          <TableSkeleton rows={4} />
        ) : (
          <form
            key={organization?.planningChecksJson ?? "defaults"}
            onSubmit={submitChecks}
          >
            <div className="supply-table-wrap mt-3">
              <table className="supply-table">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>What it finds</th>
                    <th>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {PLAN_CHECKS.map((check) => (
                    <tr key={check.key}>
                      <td>
                        <strong>{check.label}</strong>
                      </td>
                      <td>{check.hint}</td>
                      <td>
                        <select
                          name={check.key}
                          className="input"
                          aria-label={`Level for ${check.label}`}
                          defaultValue={levels[check.key]}
                          disabled={!canChecks}
                        >
                          {(["fix", "look", "off"] as const).map((level) => (
                            <option key={level} value={level}>
                              {LEVEL_LABEL[level]}
                              {level === check.level ? " (usual)" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canChecks ? (
              <button
                type="submit"
                className="btn btn-primary mt-3"
                disabled={busy != null || !organization}
              >
                {busy === "checks" ? "Saving…" : "Save checks"}
              </button>
            ) : (
              <p className="mt-2 text-sm text-ink-2">
                A manager can change these.
              </p>
            )}
          </form>
        )}
      </section>

      <section className="mt-10" aria-label="Planning rules">
        <div className="section-rule">
          <span>Planning rules</span>
          <i />
          <em>{liveRules.length}</em>
        </div>
        <p className="mt-2 max-w-[72ch] text-base text-ink-2">
          A rule suggests what else an event needs: a generator with each oven,
          one server for every 40 guests, a to-do to book the permit. Nothing is
          added until someone presses Add on the planning board.
        </p>
        {canRules && !ruleDraft ? (
          <button
            type="button"
            className="btn btn-primary mt-3"
            onClick={() => setRuleDraft(emptyRule())}
          >
            New rule
          </button>
        ) : null}

        {ruleDraft ? (
          <form className="mt-3 grid gap-3" onSubmit={submitRule}>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="field-label">
                <span>Rule name</span>
                <input
                  className="input min-h-10 w-full"
                  required
                  value={ruleDraft.name}
                  onChange={(event) =>
                    setRuleDraft({ ...ruleDraft, name: event.target.value })
                  }
                  placeholder="For example: Propane for ovens"
                />
              </label>
              <label className="field-label">
                <span>When</span>
                <select
                  className="input min-h-10 w-full"
                  value={ruleDraft.trigger}
                  disabled={ruleDraft.id != null}
                  onChange={(event) =>
                    setRuleDraft({ ...ruleDraft, trigger: event.target.value })
                  }
                >
                  {TRIGGERS.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              {ruleDraft.trigger === "equipment" ? (
                <label className="field-label">
                  <span>Equipment</span>
                  <select
                    className="input min-h-10 w-full"
                    required
                    value={ruleDraft.triggerEquipmentId}
                    disabled={ruleDraft.id != null}
                    onChange={(event) =>
                      setRuleDraft({
                        ...ruleDraft,
                        triggerEquipmentId: event.target.value,
                      })
                    }
                  >
                    <option value="">Pick an item</option>
                    {liveEquipment.map((row) => (
                      <option key={row._id} value={row._id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {ruleDraft.trigger === "equipment_kind" ? (
                <label className="field-label">
                  <span>Kind of equipment</span>
                  <input
                    className="input min-h-10 w-full"
                    required
                    list="plan-equipment-kinds"
                    value={ruleDraft.triggerEquipmentKind}
                    disabled={ruleDraft.id != null}
                    onChange={(event) =>
                      setRuleDraft({
                        ...ruleDraft,
                        triggerEquipmentKind: event.target.value,
                      })
                    }
                  />
                  <datalist id="plan-equipment-kinds">
                    {kinds.map((kind) => (
                      <option key={kind} value={kind} />
                    ))}
                  </datalist>
                </label>
              ) : null}
            </div>
            {ruleDraft.id != null ? (
              <p className="text-sm text-ink-2">
                What sets a rule off stays as it was made. For a different one,
                retire this rule and make a new one.
              </p>
            ) : null}

            <p className="text-base font-semibold">It suggests</p>
            {ruleDraft.actions.map((action, index) => (
              <div
                key={index}
                className="grid gap-3 border-b border-line pb-3 sm:grid-cols-6"
              >
                <label className="field-label">
                  <span>What</span>
                  <select
                    className="input min-h-10 w-full"
                    value={action.kind}
                    onChange={(event) =>
                      setAction(index, {
                        kind: event.target.value as RuleAction["kind"],
                        target: "",
                      })
                    }
                  >
                    {RULE_ACTION_KINDS.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label sm:col-span-2">
                  <span>
                    {action.kind === "equipment"
                      ? "Which equipment"
                      : action.kind === "position"
                        ? "Which role"
                        : "The to-do"}
                  </span>
                  {action.kind === "equipment" ? (
                    <select
                      className="input min-h-10 w-full"
                      value={action.target}
                      onChange={(event) =>
                        setAction(index, { target: event.target.value })
                      }
                    >
                      <option value="">Pick an item</option>
                      {liveEquipment.map((row) => (
                        <option key={row._id} value={row._id}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input min-h-10 w-full"
                      value={action.target}
                      onChange={(event) =>
                        setAction(index, { target: event.target.value })
                      }
                      placeholder={
                        action.kind === "position"
                          ? "For example: Server"
                          : "For example: Book the fire permit"
                      }
                    />
                  )}
                </label>
                {action.kind === "task" ? (
                  <p className="text-sm text-ink-2 sm:col-span-3 sm:self-end">
                    One to-do is suggested for the event.
                  </p>
                ) : (
                  <>
                    <label className="field-label">
                      <span>Always</span>
                      <input
                        className="input min-h-10 w-full"
                        type="number"
                        min="0"
                        step="any"
                        value={action.base}
                        onChange={(event) =>
                          setAction(index, { base: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label className="field-label">
                      <span>Plus 1 for every … guests</span>
                      <input
                        className="input min-h-10 w-full"
                        type="number"
                        min="0"
                        step="any"
                        value={
                          action.perGuest > 0
                            ? Number((1 / action.perGuest).toFixed(4))
                            : ""
                        }
                        placeholder="Not by guests"
                        onChange={(event) => {
                          const guests = Number(event.target.value);
                          setAction(index, {
                            perGuest: guests > 0 ? 1 / guests : 0,
                          });
                        }}
                      />
                    </label>
                    <label className="field-label">
                      <span>Plus, for each one on the event</span>
                      <input
                        className="input min-h-10 w-full"
                        type="number"
                        min="0"
                        step="any"
                        value={action.perTrigger}
                        disabled={ruleDraft.trigger === "every_event"}
                        onChange={(event) =>
                          setAction(index, {
                            perTrigger: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setRuleDraft({
                    ...ruleDraft,
                    actions: [...ruleDraft.actions, emptyAction()],
                  })
                }
              >
                Add another
              </button>
              {ruleDraft.actions.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setRuleDraft({
                      ...ruleDraft,
                      actions: ruleDraft.actions.slice(0, -1),
                    })
                  }
                >
                  Remove the last one
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy != null}
              >
                {busy === "rule" ? "Saving…" : "Save rule"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setRuleDraft(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {rules === undefined ? (
          <TableSkeleton rows={3} />
        ) : liveRules.length === 0 ? (
          <EmptyState
            title="No planning rules yet."
            hint="The parts that always go with an equipment item are suggested without a rule."
          />
        ) : (
          <ul className="mt-3 border-t-[1.5px] border-ink">
            {liveRules.map((rule) => (
              <li key={rule._id} className="border-b border-line py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold text-ink">{rule.name}</h3>
                    <p className="text-base text-ink-2">{triggerText(rule)}</p>
                    <ul className="mt-1 text-base text-ink-2">
                      {parseRuleActions(rule.actionsJson).map(
                        (action, index) => (
                          <li key={index}>
                            {action.kind === "equipment"
                              ? equipmentName(action.target)
                              : action.kind === "position"
                                ? `Crew position: ${action.target}`
                                : `To-do: ${action.target}`}
                            {action.kind !== "task"
                              ? ` · ${ruleAmountText(action)}`
                              : ""}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip status={String(rule.status)} />
                    {canRules ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() =>
                            setRuleDraft({
                              id: rule._id,
                              version: rule.version,
                              name: rule.name,
                              trigger: String(rule.trigger),
                              triggerEquipmentId: rule.triggerEquipmentId ?? "",
                              triggerEquipmentKind:
                                rule.triggerEquipmentKind ?? "",
                              actions: parseRuleActions(rule.actionsJson),
                            })
                          }
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() =>
                            void run(
                              `rule:${rule._id}`,
                              () =>
                                (String(rule.status) === "active"
                                  ? retireRule
                                  : reinstateRule)({
                                  docId: rule._id,
                                  version: rule.version,
                                }),
                              String(rule.status) === "active"
                                ? "Rule retired"
                                : "Rule back in use",
                            )
                          }
                        >
                          {String(rule.status) === "active"
                            ? "Retire"
                            : "Use again"}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-label="Trucks">
        <div className="section-rule">
          <span>Trucks</span>
          <i />
          <em>Seats and driver certificate</em>
        </div>
        <p className="mt-2 max-w-[72ch] text-base text-ink-2">
          Seats count the driver. The certificate is the name of the staff
          qualification a driver of this truck has to hold; leave it empty when
          any driver will do.
        </p>
        {trucks.length === 0 ? (
          <p className="mt-2 text-base text-ink-2">No trucks in the fleet.</p>
        ) : (
          <ul className="mt-3 border-t-[1.5px] border-ink">
            {trucks.map((truck) => (
              <li key={truck._id} className="border-b border-line py-2">
                <form
                  key={`${truck._id}:${truck.version}`}
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(formEvent) => {
                    formEvent.preventDefault();
                    const data = new FormData(formEvent.currentTarget);
                    const seats = String(data.get("seatCount") ?? "").trim();
                    void run(
                      `truck:${truck._id}`,
                      () =>
                        setCrewFacts({
                          docId: truck._id,
                          version: truck.version,
                          seatCount:
                            seats === ""
                              ? undefined
                              : Math.round(Number(seats)),
                          driverQualificationName:
                            String(
                              data.get("driverQualificationName") ?? "",
                            ).trim() || undefined,
                        }),
                      "Truck saved",
                    );
                  }}
                >
                  <p className="min-w-48 flex-1 text-base font-semibold">
                    {rigName(truck, "Truck")}
                  </p>
                  <label className="field-label">
                    <span>Seats</span>
                    <input
                      name="seatCount"
                      type="number"
                      min="1"
                      step="1"
                      className="input min-h-10 w-24"
                      defaultValue={truck.seatCount ?? ""}
                      placeholder="Not said"
                      disabled={!canTrucks}
                    />
                  </label>
                  <label className="field-label">
                    <span>Driver certificate</span>
                    <input
                      name="driverQualificationName"
                      className="input min-h-10 w-56"
                      defaultValue={truck.driverQualificationName ?? ""}
                      placeholder="Any driver"
                      disabled={!canTrucks}
                    />
                  </label>
                  {canTrucks ? (
                    <button
                      type="submit"
                      className="btn btn-ghost min-h-10"
                      disabled={busy != null}
                    >
                      {busy === `truck:${truck._id}` ? "Saving…" : "Save"}
                    </button>
                  ) : null}
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-label="Equipment">
        <div className="section-rule">
          <span>Equipment</span>
          <i />
          <em>What it needs and what it gives</em>
        </div>
        <p className="mt-2 max-w-[72ch] text-base text-ink-2">
          Use your own words, the same each time. “Gives” is what the item
          supplies: a generator gives “power:240v x 2”. “Needs” is what it has
          to have, one line each; “or” between choices: an oven needs
          “power:240v or fuel:propane x 1”. The planning board then says when
          nothing on an event supplies what an item needs.
        </p>
        <input
          type="search"
          className="input mt-3 w-full max-w-sm"
          placeholder="Find equipment to set up"
          aria-label="Find equipment to set up"
          value={equipmentFind}
          onChange={(event) => setEquipmentFind(event.target.value)}
        />
        {needle === "" &&
        !liveEquipment.some(
          (row) => row.needsJson != null || row.providesJson != null,
        ) ? (
          <p className="mt-2 text-base text-ink-2">
            Nothing is set up yet. Find an item to say what it needs or gives.
          </p>
        ) : null}
        <ul className="mt-3 border-t-[1.5px] border-ink">
          {(needle === ""
            ? shownEquipment.filter(
                (row) => row.needsJson != null || row.providesJson != null,
              )
            : shownEquipment.filter((row) =>
                `${row.name} ${row.category}`.toLowerCase().includes(needle),
              )
          )
            .slice(0, 30)
            .map((row) => (
              <li key={row._id} className="border-b border-line py-2">
                <form
                  key={`${row._id}:${row.version}`}
                  className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
                  onSubmit={(formEvent) => {
                    formEvent.preventDefault();
                    const data = new FormData(formEvent.currentTarget);
                    void run(
                      `equipment:${row._id}`,
                      () =>
                        setOperatingFacts({
                          docId: row._id,
                          version: row.version,
                          providesJson: suppliesJson(
                            suppliesFromText(
                              String(data.get("provides") ?? ""),
                            ),
                          ),
                          needsJson: needsJson(
                            needsFromText(String(data.get("needs") ?? "")),
                          ),
                        }),
                      `${row.name} saved`,
                    );
                  }}
                >
                  <p className="text-base font-semibold">
                    {row.name}
                    <span className="block text-sm font-normal text-ink-3">
                      {row.category}
                    </span>
                  </p>
                  <label className="field-label">
                    <span>Gives</span>
                    <input
                      name="provides"
                      className="input min-h-10 w-full"
                      defaultValue={suppliesToText(
                        parseSupplies(row.providesJson),
                      )}
                      placeholder="Nothing"
                      disabled={!canEquipment}
                    />
                  </label>
                  <label className="field-label">
                    <span>Needs</span>
                    <textarea
                      name="needs"
                      className="input min-h-10 w-full"
                      rows={2}
                      defaultValue={needsToText(parseNeeds(row.needsJson))}
                      placeholder="Nothing"
                      disabled={!canEquipment}
                    />
                  </label>
                  {canEquipment ? (
                    <button
                      type="submit"
                      className="btn btn-ghost min-h-10"
                      disabled={busy != null}
                    >
                      {busy === `equipment:${row._id}` ? "Saving…" : "Save"}
                    </button>
                  ) : null}
                </form>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
