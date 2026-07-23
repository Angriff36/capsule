import { useUser } from "@clerk/react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import {
  useListEvent,
  useListEventAssignment,
  useListIngredient,
  useListInventoryItem,
  useListInvoice,
  useListPayment,
  useListVendorOrder,
} from "../../lib/manifest-convex-react";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { useSlowQuery } from "../../ui/useSlowQuery";
import { DashboardWidgetCard } from "./DashboardWidgetCard";
import {
  DASHBOARD_WIDGET_CATALOG,
  DEFAULT_DASHBOARD_WIDGETS,
  DashboardWidgetPolicy,
  type DashboardWidgetId,
  normalizeDashboardPins,
} from "./DashboardWidgetPolicy";
import "./HomeDashboard.css";

const policy = new DashboardWidgetPolicy();

const DASHBOARD_METADATA_KEY = "capsuleDashboardWidgets";

/** User-owned home dashboard over live Convex domain subscriptions. */
export function HomePage() {
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  const { isLoaded: userLoaded, user } = useUser();
  const events = useListEvent();
  const invoices = useListInvoice();
  const inventoryItems = useListInventoryItem();
  const ingredients = useListIngredient();
  const assignments = useListEventAssignment();
  const payments = useListPayment();
  const vendorOrders = useListVendorOrder();
  const [customizing, setCustomizing] = useState(false);
  const [draftPins, setDraftPins] = useState<DashboardWidgetId[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loading =
    [
      authStatus,
      events,
      invoices,
      inventoryItems,
      ingredients,
      assignments,
      payments,
      vendorOrders,
    ].some((value) => value === undefined) || !userLoaded;
  const { loadingTooLong } = useSlowQuery(loading ? undefined : true);

  const pinnedWidgets = useMemo(() => {
    const stored = user?.unsafeMetadata?.[DASHBOARD_METADATA_KEY];
    if (!Array.isArray(stored)) return DEFAULT_DASHBOARD_WIDGETS;
    return normalizeDashboardPins(stored);
  }, [user]);

  const views = useMemo(() => {
    if (loading) return null;
    return policy.build({
      events: events ?? [],
      invoices: invoices ?? [],
      inventoryItems: inventoryItems ?? [],
      ingredients: ingredients ?? [],
      assignments: assignments ?? [],
      payments: payments ?? [],
      vendorOrders: vendorOrders ?? [],
    });
  }, [
    loading,
    events,
    invoices,
    inventoryItems,
    ingredients,
    assignments,
    payments,
    vendorOrders,
  ]);

  useEffect(() => {
    if (!customizing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setCustomizing(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [customizing, saving]);

  const openCustomizer = () => {
    setDraftPins([...pinnedWidgets]);
    setSaveError(null);
    setCustomizing(true);
  };

  const togglePin = (id: DashboardWidgetId) => {
    setDraftPins((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id].slice(0, 6),
    );
  };

  const savePins = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (!user) throw new Error("Your user profile is still loading.");
      await user.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          [DASHBOARD_METADATA_KEY]: draftPins,
        },
      });
      setCustomizing(false);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Dashboard changes could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading || views == null || authStatus == null) {
    return (
      <QueryLoadState
        loadingTooLong={loadingTooLong}
        title="Assembling your dashboard"
        detail="Subscribing to events, finance, stock, and staffing records."
      />
    );
  }

  const roleLabel = String(authStatus.role || "staff").replaceAll("_", " ");

  return (
    <div className="dashboard-stage">
      <header className="dashboard-masthead">
        <div className="dashboard-masthead__copy">
          <p className="eyebrow">Home / {roleLabel}</p>
          <h1 className="display-title">Today, at a glance.</h1>
          <p>
            Your pinned operating signals, refreshed as Capsule records change.
            Keep the board spare or pin the full six—this view belongs to you.
          </p>
        </div>
        <div className="dashboard-masthead__actions">
          <span className="dashboard-live-stamp">
            <i /> Convex subscriptions live
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={openCustomizer}
          >
            Customize widgets
          </button>
          <Link to="/events/new" className="btn btn-primary">
            New event
          </Link>
        </div>
      </header>

      <div className="dashboard-board-head">
        <div>
          <p className="eyebrow">Pinned workspace</p>
          <h2>Your operating board</h2>
        </div>
        <span>{pinnedWidgets.length} / 6 widgets pinned</span>
      </div>

      {pinnedWidgets.length === 0 ? (
        <section className="dashboard-empty-board">
          <div>
            <p className="eyebrow">A clear desk</p>
            <h2>No widgets pinned</h2>
            <p>
              Choose the signals you want waiting here when you open Capsule.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={openCustomizer}
            >
              Pin widgets
            </button>
          </div>
        </section>
      ) : (
        <section
          className="dashboard-grid"
          aria-label="Pinned dashboard widgets"
        >
          {pinnedWidgets.map((id) => (
            <DashboardWidgetCard key={id} view={views[id]} />
          ))}
        </section>
      )}

      {customizing ? (
        <div
          className="dashboard-customizer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setCustomizing(false);
            }
          }}
        >
          <section
            className="dashboard-customizer__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-customizer-title"
          >
            <div className="dashboard-customizer__head">
              <div>
                <p className="eyebrow">Personal workspace</p>
                <h2 id="dashboard-customizer-title">Choose your dashboard</h2>
                <p>Pin any combination of these six live operating views.</p>
              </div>
              <button
                type="button"
                className="dashboard-customizer__close"
                aria-label="Close widget customizer"
                onClick={() => setCustomizing(false)}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <div className="dashboard-customizer__grid">
              {DASHBOARD_WIDGET_CATALOG.map((item) => (
                <label key={item.id} className="dashboard-pin-option">
                  <input
                    type="checkbox"
                    checked={draftPins.includes(item.id)}
                    onChange={() => togglePin(item.id)}
                    disabled={saving}
                  />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </span>
                </label>
              ))}
            </div>

            <div className="dashboard-customizer__foot">
              <div>
                <p className="dashboard-customizer__count">
                  {draftPins.length} of 6 selected
                </p>
                {saveError ? (
                  <p className="dashboard-customizer__error" role="alert">
                    {saveError}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setCustomizing(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void savePins()}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save dashboard"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
