import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreatePackRule,
  useListPackRule,
  useListServiceStyle,
  usePackRuleReinstate,
  usePackRuleRetire,
  usePackRuleRevise,
} from "../../lib/manifest-convex-react";
import { useDishesByIds } from "../../lib/useDishesByIds";
import { PageHeader, StatusChip, TableSkeleton } from "../../ui/primitives";
import { classifyCommandFailure } from "../events/CommandFailure";
import { LogisticsFailureBanner } from "./LogisticsFailureBanner";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";
import { PackRuleFields } from "./PackRuleFields";
import {
  describeRuleAmount,
  describeRuleOwner,
  describeRuleWhen,
  draftFromRule,
  EMPTY_PACK_RULE_DRAFT,
  packRuleArgs,
  type PackRuleDraft,
  type PackRuleRow,
} from "./packRuleDraft";

/**
 * Pack rules: what an event fact puts on the pack list - a dish's tongs, the
 * cones a dish note asks for, napkins per guest, flooring for a grass venue,
 * the bar kit. Every live pack list follows them; a line someone set by hand
 * keeps its amount.
 */
export function PackRulesPage() {
  const rules = useListPackRule() as PackRuleRow[] | undefined;
  // Only the dishes these rules name; the rule form's picker searches.
  const dishes = useDishesByIds(
    rules?.map((rule) => (rule.dishId ? String(rule.dishId) : null)),
  );
  const styles = useListServiceStyle();
  const define = useCreatePackRule();
  const revise = usePackRuleRevise();
  const retire = usePackRuleRetire();
  const reinstate = usePackRuleReinstate();
  const [draft, setDraft] = useState<PackRuleDraft>(EMPTY_PACK_RULE_DRAFT);
  const [editing, setEditing] = useState<{
    id: string;
    draft: PackRuleDraft;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const run = async (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  const dishOptions = (dishes ?? [])
    .filter((dish) => dish.deletedAt == null)
    .map((dish) => ({ _id: dish._id, name: dish.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const styleOptions = (styles ?? [])
    .filter((style) => style.deletedAt == null && style.status === "active")
    .map((style) => ({ _id: style._id, name: style.name }));
  const names = {
    dish: (id: string) =>
      dishOptions.find((dish) => dish._id === id)?.name ?? "A dish",
    style: (id: string) =>
      styleOptions.find((style) => style._id === id)?.name ?? "a style",
  };
  const live = (rules ?? [])
    .filter((rule) => rule.deletedAt == null)
    .sort(
      (a, b) =>
        a.trigger.localeCompare(b.trigger) ||
        a.description.localeCompare(b.description),
    );

  const submitAdd = (domEvent: FormEvent) => {
    domEvent.preventDefault();
    if (!draft.description.trim()) return;
    void run("add", async () => {
      await define({ trigger: draft.trigger, ...packRuleArgs(draft) });
      setDraft(EMPTY_PACK_RULE_DRAFT);
    });
  };

  const submitEdit = (rule: PackRuleRow, domEvent: FormEvent) => {
    domEvent.preventDefault();
    if (!editing) return;
    void run(`edit:${rule._id}`, async () => {
      await revise({
        docId: rule._id,
        version: rule.version,
        ...packRuleArgs(editing.draft),
      });
      setEditing(null);
    });
  };

  const fields = (
    value: PackRuleDraft,
    onChange: (patch: Partial<PackRuleDraft>) => void,
    lockTrigger = false,
  ) => (
    <div className="mt-2 grid gap-3 md:grid-cols-4">
      <PackRuleFields
        draft={value}
        styles={styleOptions}
        disabled={busy != null}
        onChange={(patch) =>
          onChange(lockTrigger ? { ...patch, trigger: value.trigger } : patch)
        }
      />
    </div>
  );

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Pack rules"
        lead={
          <>
            What an event puts on its{" "}
            <Link className="link" to="/logistics/packs">
              pack list
            </Link>
            : a dish's tools, what a dish note asks for, napkins per guest,
            flooring for a grass venue, the bar kit. Every pack list still being
            packed follows these; an amount set by hand on a list stays.
          </>
        }
      />
      <LogisticsWorkspaceNav />
      {failure ? <LogisticsFailureBanner error={failure} /> : null}

      {rules === undefined ? (
        <TableSkeleton rows={5} />
      ) : live.length === 0 ? (
        <div className="document-empty">
          <p>No pack rules yet.</p>
          <span>Add the first one below.</span>
        </div>
      ) : (
        <div className="supply-table-wrap mt-4">
          <table className="supply-table phone-cards">
            <thead>
              <tr>
                <th>Item</th>
                <th>When</th>
                <th>How many</th>
                <th>Kind and owner</th>
                <th>State</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {live.map((rule) => (
                <tr key={rule._id}>
                  <td>
                    <strong>{rule.description}</strong>
                    <small className="block">Version {rule.ruleVersion}</small>
                  </td>
                  <td data-label="When">{describeRuleWhen(rule, names)}</td>
                  <td data-label="How many">{describeRuleAmount(rule)}</td>
                  <td data-label="Kind and owner">{describeRuleOwner(rule)}</td>
                  <td data-label="State">
                    <StatusChip status={String(rule.status)} />
                  </td>
                  <td>
                    <div className="supply-row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() =>
                          setEditing({
                            id: rule._id,
                            draft: draftFromRule(rule),
                          })
                        }
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() =>
                          void run(`status:${rule._id}`, () =>
                            String(rule.status) === "active"
                              ? retire({
                                  docId: rule._id,
                                  version: rule.version,
                                })
                              : reinstate({
                                  docId: rule._id,
                                  version: rule.version,
                                }),
                          )
                        }
                      >
                        {String(rule.status) === "active"
                          ? "Stop using"
                          : "Use again"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <form
          className="mt-3 rounded-sm border border-line-2 bg-panel p-4"
          onSubmit={(e) =>
            submitEdit(
              live.find((rule) => rule._id === editing.id) as PackRuleRow,
              e,
            )
          }
        >
          <p className="eyebrow">Edit pack rule</p>
          {fields(
            editing.draft,
            (patch) =>
              setEditing({
                id: editing.id,
                draft: { ...editing.draft, ...patch },
              }),
            true,
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy != null}
            >
              {busy === `edit:${editing.id}` ? "Saving…" : "Save rule"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <form
        className="mt-3 rounded-sm border border-line-2 bg-panel p-4"
        onSubmit={submitAdd}
      >
        <p className="eyebrow">Add a pack rule</p>
        {fields(draft, (patch) =>
          setDraft((current) => ({ ...current, ...patch })),
        )}
        <button
          type="submit"
          className="btn btn-primary btn-sm mt-3"
          disabled={busy != null || !draft.description.trim()}
        >
          {busy === "add" ? "Adding…" : "Add pack rule"}
        </button>
      </form>
    </div>
  );
}
