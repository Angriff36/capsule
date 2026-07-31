// TPP Cutover Page — Final migration validation and go/no-go gate.
// Implements spec §6.6: final delta import, zero critical unresolved mappings,
// business validation, provider readiness, rollback plan, TPP read-only transition.

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircleIcon as CheckCircle,
  XCircleIcon as XCircle,
  AlertTriangleIcon as AlertTriangle,
  FileTextIcon as FileText,
  GearIcon as Settings,
  ArrowLeftIcon,
} from "../../../ui/icons";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/lib/api";
import { classifyCommandFailure } from "../../events/CommandFailure";
import { FailureBanner } from "../../events/FailureBanner";
import { PageHeader, TableSkeleton } from "../../../ui/primitives";
import { useActionPrompt } from "../../../ui/action-prompt";
import { formatDate } from "@/lib/format";
import { useAuthStatus } from "@/lib/useAuthStatus";
import { AdminWorkspaceNav } from "../AdminWorkspaceNav";

interface ValidationCheck {
  passed: boolean;
  message: string;
  details?: string;
  count?: number;
  hasPlan?: boolean;
}

export function CutoverPage() {
  // `host` renders the prompt panel — without it askReason/askConfirm would
  // show nothing and their promises would never resolve.
  const { prompt, host } = useActionPrompt();
  const authStatus = useAuthStatus();
  const isAdmin =
    authStatus?.role === "admin" ||
    authStatus?.role === "owner" ||
    authStatus?.role?.endsWith("_manager");

  // Queries
  const validation = useQuery(api.cutover.validateCutoverReadiness, {});
  const cutoverStatus = useQuery(api.cutover.getCutoverStatus, {});
  const latestImport = useQuery(api.cutover.getLatestImportRun, {});

  // Mutations
  const executeDecision = useMutation(api.cutover.executeCutoverDecision);
  const setTppReadOnly = useMutation(api.cutover.setTppReadOnly);
  const rollbackCutoverMutation = useMutation(api.cutover.rollbackCutover);

  // Local state
  const [localApproval, setLocalApproval] = useState(false);
  const [localRollbackPlan, setLocalRollbackPlan] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Execute go/no-go decision
  const handleExecuteDecision = async (decision: "go" | "no_go") => {
    if (!localRollbackPlan.trim()) {
      const reason = await prompt.askReason({
        title: "Rollback Plan Required",
        description:
          "Please document the rollback plan before executing cutover decision.",
        label: "Rollback plan",
        placeholder: "Describe the rollback strategy...",
        confirmLabel: "Continue",
      });
      if (reason) {
        setLocalRollbackPlan(reason);
        await executeDecisionAction(decision, reason);
      }
      return;
    }

    await executeDecisionAction(decision, localRollbackPlan);
  };

  const executeDecisionAction = async (
    decision: "go" | "no_go",
    rollbackPlan: string,
  ) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await executeDecision({
        decision,
        reason:
          decision === "go"
            ? `Cutover approved - all checks passed. Rollback plan: ${rollbackPlan}`
            : `Cutover rejected - ${rollbackPlan}`,
      });
      window.location.reload();
    } catch (err) {
      const failure = classifyCommandFailure(err);
      setError(`${failure.title}: ${failure.detail}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Set TPP read-only
  const handleSetTppReadOnly = async () => {
    const reason = await prompt.askReason({
      title: "Set TPP Read-Only",
      description:
        "This will disable scheduled TPP imports. TPP will become read-only. Provide a reason:",
      label: "Reason",
      placeholder: "Reason for setting TPP read-only...",
      confirmLabel: "Set Read-Only",
    });

    if (reason) {
      setIsSubmitting(true);
      setError(null);
      try {
        await setTppReadOnly({ reason });
        window.location.reload();
      } catch (err) {
        const failure = classifyCommandFailure(err);
        setError(`${failure.title}: ${failure.detail}`);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Rollback cutover
  const handleRollback = async () => {
    const reason = await prompt.askReason({
      title: "Rollback Cutover",
      description:
        "This will rollback the cutover decision and re-enable TPP for writes. Explain why:",
      label: "Rollback reason",
      placeholder: "Reason for rollback...",
      confirmLabel: "Rollback",
    });

    if (reason) {
      setIsSubmitting(true);
      setError(null);
      try {
        await rollbackCutoverMutation({ reason });
        window.location.reload();
      } catch (err) {
        const failure = classifyCommandFailure(err);
        setError(`${failure.title}: ${failure.detail}`);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Validation card component
  const ValidationCard = ({
    title,
    check,
    details,
    action,
  }: {
    title: string;
    check: ValidationCheck;
    details?: string;
    action?: React.ReactNode;
  }) => (
    <div className="border rounded-sm p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {check.passed ? (
            <CheckCircle className="w-5 h-5 text-ok" />
          ) : (
            <XCircle className="w-5 h-5 text-danger" />
          )}
          <h3 className="font-medium">{title}</h3>
        </div>
        {action}
      </div>
      <p className="text-xs text-ink-2">{check.message}</p>
      {details && <p className="text-2xs text-ink-3">{details}</p>}
      {check.count !== undefined && check.count > 0 && (
        <p className="text-xs text-danger font-medium">
          {check.count} items require attention
        </p>
      )}
    </div>
  );

  // Loading state
  if (!validation || !cutoverStatus) {
    return (
      <div className="operations-stage space-y-6">
        <PageHeader
          title="TPP Migration Cutover"
          lead="Final validation and go/no-go gate for TPP migration."
        />
        <AdminWorkspaceNav />
        <TableSkeleton rows={8} />
      </div>
    );
  }

  return (
    <div className="operations-stage space-y-6">
      <PageHeader
        title="TPP Migration Cutover"
        lead="Final validation and go/no-go gate for TPP migration."
        actions={
          <Link to="/admin" className="btn btn-secondary btn-sm">
            <ArrowLeftIcon width={12} height={12} className="mr-2" />
            Back to Admin
          </Link>
        }
      />
      <AdminWorkspaceNav />

      {host}

      {/* Error banner */}
      {error && (
        <FailureBanner failure={classifyCommandFailure(new Error(error))} />
      )}

      {/* Status banner */}
      {cutoverStatus.status === "go" && (
        <div className="flex items-center gap-3 p-4 bg-ok-soft border border-ok/40 rounded-sm">
          <CheckCircle className="w-5 h-5 text-ok" />
          <div>
            <p className="font-medium">Cutover Approved</p>
            <p className="text-xs text-ok">
              TPP migration cutover was approved on{" "}
              {formatDate(cutoverStatus.decidedAt)}.
            </p>
          </div>
        </div>
      )}

      {cutoverStatus.status === "no_go" && (
        <div className="flex items-center gap-3 p-4 bg-danger-soft border border-danger/40 rounded-sm">
          <XCircle className="w-5 h-5 text-danger" />
          <div>
            <p className="font-medium">Cutover Rejected</p>
            <p className="text-xs text-danger">
              TPP migration cutover was rejected on{" "}
              {formatDate(cutoverStatus.decidedAt)}.
            </p>
          </div>
        </div>
      )}

      {cutoverStatus.status === "rolled_back" && (
        <div className="flex items-center gap-3 p-4 bg-warn-soft border border-warn/40 rounded-sm">
          <AlertTriangle className="w-5 h-5 text-warn" />
          <div>
            <p className="font-medium">Cutover Rolled Back</p>
            <p className="text-xs text-warn">
              Emergency rollback executed on{" "}
              {formatDate(cutoverStatus.decidedAt)}.
            </p>
          </div>
        </div>
      )}

      {/* Warnings */}
      {validation.warnings && validation.warnings.length > 0 && (
        <div className="p-4 bg-warn-soft border border-warn/40 rounded-sm">
          <div className="space-y-1">
            <p className="font-medium">Warnings</p>
            <ul className="list-disc list-inside text-xs space-y-1">
              {validation.warnings.map((warning: string, i: number) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Validation results */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Cutover Validation</h2>

        {/* Overall status */}
        <div
          className={`border rounded-sm p-4 ${
            validation.canProceed
              ? "border-ok/40 bg-ok-soft"
              : "border-danger/40 bg-danger-soft"
          }`}
        >
          <div className="flex items-center gap-2">
            {validation.canProceed ? (
              <CheckCircle className="w-6 h-6 text-ok" />
            ) : (
              <XCircle className="w-6 h-6 text-danger" />
            )}
            <h3 className="font-medium">
              {validation.canProceed ? "Ready for Cutover" : "Cutover Blocked"}
            </h3>
          </div>
          {!validation.canProceed && validation.blockers.length > 0 && (
            <ul className="list-disc list-inside text-xs mt-2 text-danger space-y-1">
              {validation.blockers.map((blocker: string, i: number) => (
                <li key={i}>{blocker}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Individual checks */}
        <div className="grid gap-4">
          <ValidationCard
            title="Final Delta Import"
            check={validation.checks.finalDeltaImport}
            details={validation.checks.finalDeltaImport.details}
            action={
              validation.checks.finalDeltaImport.passed && latestImport ? (
                <span className="text-2xs text-ink-3">
                  {new Date(
                    latestImport.completionTime || 0,
                  ).toLocaleDateString()}
                </span>
              ) : (
                <Link
                  to="/admin/imports"
                  className="text-xs text-info hover:text-info"
                >
                  View Imports
                </Link>
              )
            }
          />

          <ValidationCard
            title="Zero Critical Mappings"
            check={validation.checks.zeroCriticalMappings}
            details="All TPP legacy record mappings must be verified"
            action={
              (validation.checks.zeroCriticalMappings.count || 0) > 0 ? (
                <Link
                  to="/admin/reconcile"
                  className="text-xs text-info hover:text-info"
                >
                  Resolve Mappings
                </Link>
              ) : null
            }
          />

          <ValidationCard
            title="Business Validation"
            check={validation.checks.businessValidation}
            details="Requires manual sign-off from business stakeholders"
            action={
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={localApproval}
                  onChange={(e) => setLocalApproval(e.target.checked)}
                  disabled={!isAdmin}
                />
                I approve this cutover
              </label>
            }
          />

          <ValidationCard
            title="Provider Readiness"
            check={validation.checks.providerReadiness}
            details="QuickBooks, Calendar, SMS integrations operational"
          />

          <ValidationCard
            title="Rollback Plan"
            check={validation.checks.rollbackPlan}
            details="Document rollback strategy before cutover"
            action={
              <button
                type="button"
                onClick={() =>
                  setLocalRollbackPlan(
                    "Rollback: Revert latest import, re-enable TPP writes",
                  )
                }
                className="text-xs text-info hover:text-info"
              >
                Use Template
              </button>
            }
          />
        </div>

        {/* Rollback plan input */}
        <div className="border rounded-sm p-4 space-y-2">
          <label className="flex items-center gap-2 font-medium">
            <FileText className="w-4 h-4" />
            Rollback Plan
          </label>
          <textarea
            className="w-full border rounded-sm p-2 text-xs min-h-[100px]"
            placeholder="Describe the rollback strategy: what to revert, how to re-enable TPP, data recovery steps..."
            value={localRollbackPlan}
            onChange={(e) => setLocalRollbackPlan(e.target.value)}
            disabled={!isAdmin}
          />
        </div>
      </div>

      {/* Cutover actions */}
      <div className="border rounded-sm p-4 space-y-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Cutover Actions
        </h2>

        <div className="grid gap-3">
          {cutoverStatus.status === "not_started" ||
          cutoverStatus.status === null ? (
            <>
              <button
                type="button"
                className="btn btn-lg border-ok bg-ok text-white"
                disabled={
                  !validation.canProceed ||
                  !localApproval ||
                  !localRollbackPlan ||
                  !isAdmin ||
                  isSubmitting
                }
                onClick={() => handleExecuteDecision("go")}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Execute GO Decision
              </button>

              <button
                type="button"
                className="btn btn-lg btn-danger"
                disabled={!isAdmin || isSubmitting}
                onClick={() => handleExecuteDecision("no_go")}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Execute NO-GO Decision
              </button>
            </>
          ) : cutoverStatus.status === "go" ? (
            <>
              <button
                type="button"
                className="btn btn-lg"
                disabled={!isAdmin || isSubmitting}
                onClick={handleSetTppReadOnly}
              >
                <Settings className="w-4 h-4 mr-2" />
                Set TPP Read-Only
              </button>

              <button
                type="button"
                className="btn btn-lg btn-secondary"
                disabled={!isAdmin || isSubmitting}
                onClick={handleRollback}
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Emergency Rollback
              </button>
            </>
          ) : cutoverStatus.status === "no_go" ? (
            <div className="p-4 bg-inset rounded-sm text-xs text-ink-2">
              Cutover was rejected. Address blockers and retry when ready.
            </div>
          ) : cutoverStatus.status === "rolled_back" ? (
            <div className="p-4 bg-warn-soft rounded-sm text-xs text-warn">
              Cutover was rolled back. Review the rollback plan and retry when
              ready.
            </div>
          ) : null}
        </div>

        {!isAdmin && (
          <p className="text-xs text-ink-3">
            Only organization administrators can execute cutover decisions.
          </p>
        )}
      </div>

      {/* Help text */}
      <div className="text-xs text-ink-2 space-y-1">
        <p className="font-medium">How the final switch works:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Run one last import to catch anything new in TPP</li>
          <li>Match up every remaining imported record</li>
          <li>Write down the plan for switching back, just in case</li>
          <li>Get sign-off from the business</li>
          <li>Approve the switch</li>
          <li>Set TPP to read-only</li>
        </ol>
      </div>
    </div>
  );
}
