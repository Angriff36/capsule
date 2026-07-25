// Routing helpers for Import Reconciliation feature

/**
 * Path to the import runs list page
 */
export const importRunsListPath = () => "/admin/imports";

/**
 * Path to a specific import run detail page
 */
export const importRunDetailPath = (id: string) => `/admin/imports/${id}`;

/**
 * Path to the external records reconciliation queue
 */
export const reconcilePath = () => "/admin/reconcile";

/**
 * Path to import datasets management
 */
export const importDatasetsPath = () => "/admin/import-datasets";

/**
 * Path to parallel run dashboard
 */
export const parallelRunDashboardPath = () => "/admin/parallel-run";
