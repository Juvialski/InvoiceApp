import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  ShieldAlert,
  X,
} from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import type {
  Project,
  ProjectCostCode,
  ProjectCostSummary,
  ProjectStatus,
  PurchaseOrder,
  Subcontract,
  SubcontractProgressClaim,
  SubcontractVariation,
} from "../../types.ts";
import type { ClientBilling } from "../../lib/clientBilling.ts";
import type { ClientCollection } from "../../lib/clientCollections.ts";
import type { EngineeringCoordinationWorkspaceData } from "../../lib/engineeringCoordination.ts";
import type {
  ProjectLifecycleAction,
  ProjectLifecyclePreview,
} from "../../lib/projects.ts";
import { projectCostMissingSourceLabels } from "../../utils/dataCompleteness.ts";
import {
  useAppPermissions,
  useProjectCostCompleteness,
  useWorkspaceDataPending,
} from "../../app/AppPermissionContext.tsx";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { isClassifiedProjectTaxTreatment } from "../../utils/projectTaxTreatment.ts";
import { PageHeader } from "../ui/OperationsUI.tsx";
import { useDialogFocus } from "../ui/useDialogFocus.ts";
import {
  buildPortfolioManagementSummary,
  buildProjectManagementView,
  filterAndSortProjectViews,
  type ProjectAttentionCategory,
  type ProjectHealthFilter,
  type ProjectManagementView,
  type ProjectSortDirection,
  type ProjectSortField,
} from "../../utils/projectManagementViewModel.ts";
import { createProjectDraft } from "../../utils/projectDraft.ts";
import { ProjectPortfolioRegisterSection } from "./ProjectPortfolioRegisterSection.tsx";
import { ProjectDetailsWorksheet } from "./ProjectDetailsWorksheet.tsx";
import { ProjectsWorkbookPanel, type ProjectsWorkbookRecords } from "./ProjectsWorkbookPanel.tsx";
import type { ProjectsApplyGroup } from "../../lib/projectsWorkbook.ts";

interface ProjectsPageProps {
  projects: Project[];
  summaries: Record<string, ProjectCostSummary>;
  clientBillings?: readonly ClientBilling[];
  clientCollections?: readonly ClientCollection[];
  clientFinancialDataLoading?: boolean;
  costCodes?: readonly ProjectCostCode[];
  purchaseOrders?: PurchaseOrder[];
  subcontracts?: Subcontract[];
  subcontractClaims?: SubcontractProgressClaim[];
  subcontractVariations?: SubcontractVariation[];
  engineeringCoordinationData?: EngineeringCoordinationWorkspaceData;
  companyId?: string;
  attentionToday?: string;
  initialEditingProject?: Project | null;
  onOpenProject: (project: Project) => void;
  onSaveProject: (project: Project) => Promise<void> | void;
  onPreviewProjectLifecycle: (project: Project) => Promise<ProjectLifecyclePreview>;
  onApplyProjectLifecycle: (
    project: Project,
    action: ProjectLifecycleAction,
    reason?: string,
  ) => Promise<void>;
  onRefreshProjects?: () => Promise<ProjectsWorkbookRecords>;
  onApplyProjectWorkbookGroup?: (group: ProjectsApplyGroup) => Promise<void>;
}

const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
  "ARCHIVED",
];

function blankProject(): Project {
  return createProjectDraft();
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  projects,
  summaries,
  clientBillings,
  clientCollections,
  clientFinancialDataLoading = false,
  costCodes = [],
  purchaseOrders = [],
  subcontracts = [],
  subcontractClaims = [],
  subcontractVariations = [],
  engineeringCoordinationData,
  companyId,
  attentionToday,
  initialEditingProject,
  onOpenProject,
  onSaveProject,
  onPreviewProjectLifecycle,
  onApplyProjectLifecycle,
  onRefreshProjects,
  onApplyProjectWorkbookGroup,
}) => {
  const permissions = useAppPermissions();
  const canManage = hasPermission(permissions, PERMISSION_KEYS.projectsWrite);
  const completeness = useProjectCostCompleteness();
  const workspaceDataPending = useWorkspaceDataPending();
  const hiddenCostSources = projectCostMissingSourceLabels(completeness);
  const costDataComplete = completeness.complete;

  // Search, Filters & Sorting
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | ProjectStatus>("ALL");
  const [managerFilter, setManagerFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [healthFilter, setHealthFilter] = useState<ProjectHealthFilter>("ALL");
  const [attentionCategoryFilter, setAttentionCategoryFilter] = useState<"ALL" | ProjectAttentionCategory>("ALL");
  const [sortField, setSortField] = useState<ProjectSortField>("code");
  const [sortDirection, setSortDirection] = useState<ProjectSortDirection>("asc");

  // Lifecycle & Editing state
  const [editing, setEditing] = useState<Project | null>(null);
  const [formError, setFormError] = useState("");
  const [lifecycleProject, setLifecycleProject] = useState<Project | null>(null);
  const [lifecyclePreview, setLifecyclePreview] = useState<ProjectLifecyclePreview | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const [lifecycleReason, setLifecycleReason] = useState("");

  useEffect(() => {
    if (canManage && initialEditingProject) setEditing(initialEditingProject);
  }, [canManage, initialEditingProject]);

  // 1. Build Single Source-of-Truth Project Management Views
  const projectViews = useMemo<ProjectManagementView[]>(() => {
    return projects.map((p) => {
      const summary = summaries[p.id] || ({
        budget: p.projectBudget,
        invoiceCost: 0,
        paidInvoiceCost: 0,
        unpaidInvoiceCost: 0,
        unallocatedPayrollCost: 0,
        pendingInvoiceCost: 0,
        payrollCost: 0,
        pendingPayrollCost: 0,
        otherExpenseCost: 0,
        pendingExpenseCost: 0,
        totalActualCost: 0,
        committedCost: 0,
        remainingBudget: p.projectBudget,
        budgetUsedPercent: 0,
        foreignCosts: {},
        unallocatedInvoiceCost: 0,
        unallocatedExpenseCost: 0,
      } as ProjectCostSummary);

      return buildProjectManagementView(p, summary, {
        costCodes,
        // Portfolio rows have aggregate actual-cost truth, not invoice/expense/payroll transaction detail.
        // Keep procurement-only detail out of cost-code actual classification so it remains fail-closed.
        subcontractClaims,
        financialDataComplete: costDataComplete,
        clientBillings: clientFinancialDataLoading ? undefined : clientBillings,
        clientCollections: clientFinancialDataLoading ? undefined : clientCollections,
        today: attentionToday,
        engineering: engineeringCoordinationData
          ? { rfis: engineeringCoordinationData.rfis, submittals: engineeringCoordinationData.submittals }
          : undefined,
      });
    });
  }, [attentionToday, clientBillings, clientCollections, clientFinancialDataLoading, costDataComplete, costCodes, engineeringCoordinationData, purchaseOrders, subcontractClaims, subcontractVariations, subcontracts, projects, summaries]);

  // 2. Portfolio Management Summary (Multi-currency safe)
  const portfolio = useMemo(() => {
    return buildPortfolioManagementSummary(projectViews);
  }, [projectViews]);

  // 3. Filtered and Sorted Views
  const displayedViews = useMemo(() => {
    return filterAndSortProjectViews(projectViews, {
      searchQuery: query,
      statusFilter: status,
      managerFilter,
      currencyFilter,
      healthFilter,
      attentionCategoryFilter,
      sortField,
      sortDirection,
    });
  }, [projectViews, query, status, managerFilter, currencyFilter, healthFilter, attentionCategoryFilter, sortField, sortDirection]);

  const managerOptions = useMemo(
    () => [...new Set(projectViews.map((view) => view.project.projectManager?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)),
    [projectViews],
  );
  const currencyOptions = useMemo(
    () => [...new Set(projectViews.map((view) => view.currency))].sort((a, b) => a.localeCompare(b)),
    [projectViews],
  );

  const saveProject = async (candidate: Project): Promise<boolean> => {
    if (!canManage || !candidate.projectCode.trim() || !candidate.projectName.trim()) {
      setFormError("Project Code and Project Name are required.");
      return false;
    }
    if (!isClassifiedProjectTaxTreatment(candidate.taxTreatment)) {
      setFormError("Choose VAT or Non-VAT before saving. Existing unclassified projects require an authorized confirmation.");
      return false;
    }
    setFormError("");
    await onSaveProject({
      ...candidate,
      projectCode: candidate.projectCode.trim(),
      projectName: candidate.projectName.trim(),
      currency: (candidate.currency || "PHP").toUpperCase(),
      contractValue: Math.max(0, Number(candidate.contractValue) || 0),
      projectBudget: Math.max(0, Number(candidate.projectBudget) || 0),
    });
    setEditing(null);
    return true;
  };

  const openLifecycle = async (project: Project) => {
    setLifecycleProject(project);
    setLifecyclePreview(null);
    setLifecycleError("");
    setLifecycleReason("");
    setLifecycleLoading(true);
    try {
      setLifecyclePreview(await onPreviewProjectLifecycle(project));
    } catch {
      setLifecycleError("Could not load the project lifecycle preview. No lifecycle action was taken.");
    } finally {
      setLifecycleLoading(false);
    }
  };

  const closeLifecycle = () => {
    setLifecycleProject(null);
    setLifecyclePreview(null);
    setLifecycleError("");
    setLifecycleReason("");
  };

  const lifecycleCloseButtonRef = useRef<HTMLButtonElement>(null);
  const lifecycleDialogRef = useDialogFocus({ open: Boolean(lifecycleProject), onClose: () => { if (!lifecycleLoading) closeLifecycle(); }, initialFocusRef: lifecycleCloseButtonRef });

  useEffect(() => {
    if (!lifecycleProject || lifecycleLoading) return;
    lifecycleCloseButtonRef.current?.focus({ preventScroll: true });
  }, [lifecycleProject, lifecycleLoading]);

  const applyLifecycle = async (action: ProjectLifecycleAction) => {
    if (!lifecycleProject || !lifecyclePreview) return;
    if (action === "DELETE_UNUSED" && !lifecyclePreview.canDelete) return;
    if ((action === "ARCHIVE" || action === "REACTIVATE") && lifecycleReason.trim().length < 3) return;
    setLifecycleLoading(true);
    setLifecycleError("");
    try {
      await onApplyProjectLifecycle(lifecycleProject, action, lifecycleReason.trim() || undefined);
      closeLifecycle();
    } catch {
      setLifecycleError("Could not complete the project lifecycle action. Nothing was changed.");
    } finally {
      setLifecycleLoading(false);
    }
  };

  const isHydrating = workspaceDataPending && projects.length === 0;
  const hasProjectFilters = Boolean(query.trim()) || status !== "ALL" || managerFilter !== "ALL" || currencyFilter !== "ALL" || healthFilter !== "ALL" || attentionCategoryFilter !== "ALL";
  const projectResultLabel = `${displayedViews.length} of ${projects.length} project${projects.length === 1 ? "" : "s"}`;
  const unclassifiedProjectCount = projects.filter((project) => !isClassifiedProjectTaxTreatment(project.taxTreatment)).length;

  const toggleSort = (field: ProjectSortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Project controls"
        title="Portfolio Management"
        description="Scan project health and commercial position, then open the register for evidence and action."
        actions={canManage ? <Button variant="primary" label="New project" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => { setFormError(""); setEditing(blankProject()); }} /> : undefined}
      />

      {isHydrating && (
        <div role="status" aria-live="polite" className="animate-pulse rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-600">
          Loading projects…
        </div>
      )}

      <ProjectPortfolioRegisterSection
        displayedViews={displayedViews}
        portfolio={portfolio}
        managerOptions={managerOptions}
        currencyOptions={currencyOptions}
        projectStatuses={PROJECT_STATUSES}
        query={query}
        statusFilter={status}
        managerFilter={managerFilter}
        currencyFilter={currencyFilter}
        healthFilter={healthFilter}
        attentionCategoryFilter={attentionCategoryFilter}
        sortField={sortField}
        sortDirection={sortDirection}
        canManage={canManage}
        isHydrating={isHydrating}
        projectResultLabel={projectResultLabel}
        hasProjectFilters={hasProjectFilters}
        onQueryChange={setQuery}
        onStatusChange={setStatus}
        onManagerFilterChange={setManagerFilter}
        onCurrencyFilterChange={setCurrencyFilter}
        onHealthFilterChange={setHealthFilter}
        onAttentionCategoryFilterChange={setAttentionCategoryFilter}
        onSortFieldChange={setSortField}
        onToggleSort={toggleSort}
        onClearFilters={() => {
          setQuery("");
          setStatus("ALL");
          setManagerFilter("ALL");
          setCurrencyFilter("ALL");
          setHealthFilter("ALL");
          setAttentionCategoryFilter("ALL");
        }}
        onOpenProject={onOpenProject}
        onEditProject={(project) => { setFormError(""); setEditing(project); }}
        onOpenLifecycle={openLifecycle}
      />

      {unclassifiedProjectCount > 0 && (
        <div role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p><strong>{unclassifiedProjectCount} project{unclassifiedProjectCount === 1 ? " is" : "s are"} unclassified.</strong> An authorized project manager must confirm VAT or Non-VAT before the project is used for client billing context.</p>
        </div>
      )}

      {!costDataComplete && !workspaceDataPending && (
        <Card className="border-dashed border-amber-200 bg-amber-50/70 p-4" elevation="low">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0 text-xs">
              <strong className="block font-bold text-amber-950">Some project cost metrics are unavailable</strong>
              <p className="mt-0.5 text-amber-900">
                Required cost sources are unavailable for this role: {hiddenCostSources.join(", ")}. Cost values are marked
                unavailable in the portfolio rather than shown as zero; contract and commercial source records remain separate.
              </p>
            </div>
          </div>
        </Card>
      )}

      <details aria-label="Excel import/export" data-ux45c="projects-workbook" className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 [&::-webkit-details-marker]:hidden">
          <span>Excel import/export</span>
          <span className="text-[11px] font-semibold text-slate-500">Optional workbook tools · review before Apply</span>
        </summary>
        <div className="border-t border-slate-100 p-3">
          <ProjectsWorkbookPanel
            projects={projects}
            costCodes={costCodes}
            companyId={companyId}
            canManage={canManage}
            onRefreshProjects={onRefreshProjects}
            onApplyProjectWorkbookGroup={onApplyProjectWorkbookGroup || (async () => { throw new Error("Project workbook Apply is not configured."); })}
          />
        </div>
      </details>

      {canManage && editing && (
        <ProjectDetailsWorksheet
          project={editing}
          projectStatuses={PROJECT_STATUSES}
          errorMessage={formError}
          onClose={() => setEditing(null)}
          onSave={saveProject}
        />
      )}

      {/* Lifecycle Action Modal */}
      {canManage && lifecycleProject && (
        <div
          ref={lifecycleDialogRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-lifecycle-title"
          aria-busy={lifecycleLoading}
        >
          <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Project Correction</p>
                <h2 id="project-lifecycle-title" className="mt-1 text-lg font-black text-slate-950">
                  {lifecycleProject.projectCode} · Lifecycle Options
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {lifecycleProject.projectName} · current state: {lifecycleProject.status.replaceAll("_", " ")}
                </p>
              </div>
              <button
                ref={lifecycleCloseButtonRef}
                type="button"
                onClick={closeLifecycle}
                disabled={lifecycleLoading}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Close project lifecycle dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {lifecycleLoading && !lifecyclePreview && (
              <p role="status" className="mt-5 rounded-xl bg-slate-50 p-4 text-xs font-semibold text-slate-600">
                Checking project dependencies…
              </p>
            )}

            {lifecycleError && (
              <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
                {lifecycleError}
              </p>
            )}

            {lifecyclePreview && (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-950">
                  <p className="font-black">
                    {lifecyclePreview.source === "database"
                      ? "Database-checked dependency summary"
                      : lifecyclePreview.source === "demo"
                        ? "Demo dependency summary"
                        : "Local dependency summary"}
                  </p>
                  <p className="mt-1">
                    {lifecyclePreview.totalDependencyCount
                      ? `${lifecyclePreview.totalDependencyCount} linked record${lifecyclePreview.totalDependencyCount === 1 ? "" : "s"} preserve this project identity.`
                      : "No linked operational or financial history was found."}
                  </p>
                  {lifecyclePreview.totalDependencyCount > 0 && (
                    <ul className="mt-2 grid gap-1 text-[10px] sm:grid-cols-2">
                      {Object.entries(lifecyclePreview.dependencies)
                        .filter(([, count]) => Number(count) > 0)
                        .map(([k, count]) => (
                          <li key={k} className="flex justify-between gap-2">
                            <span>{k.replaceAll(/([a-z])([A-Z])/g, "$1 $2")}</span>
                            <strong>{Number(count)}</strong>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>

                {lifecyclePreview.canDelete && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <p className="text-xs font-black text-rose-950">Delete Unused Project</p>
                    <p className="mt-1 text-[10px] leading-4 text-rose-900">
                      This permanently deletes the project because no operational or financial history exists.
                    </p>
                    <button
                      type="button"
                      disabled={lifecycleLoading}
                      onClick={() => void applyLifecycle("DELETE_UNUSED")}
                      className="mt-3 rounded-lg bg-rose-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40"
                    >
                      {lifecycleLoading ? "Deleting…" : "Delete unused project"}
                    </button>
                  </div>
                )}

                {lifecyclePreview.status !== "ARCHIVED" && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-black text-amber-950">Archive Project</p>
                    <p className="mt-1 text-[10px] leading-4 text-amber-900">
                      This keeps the project and its historical records but removes it from active workflows.
                    </p>
                    <input
                      value={lifecycleReason}
                      onChange={(e) => setLifecycleReason(e.target.value)}
                      placeholder="Reason for archive"
                      className="mt-3 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      disabled={lifecycleLoading || lifecycleReason.trim().length < 3}
                      onClick={() => void applyLifecycle("ARCHIVE")}
                      className="mt-3 rounded-lg bg-amber-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40"
                    >
                      {lifecycleLoading ? "Archiving…" : "Archive project"}
                    </button>
                  </div>
                )}

                {lifecyclePreview.status === "ARCHIVED" && lifecyclePreview.canReactivate && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-xs font-black text-emerald-950">Reactivate Project</p>
                    <p className="mt-1 text-[10px] leading-4 text-emerald-900">
                      This returns the project to its prior non-terminal workflow state. Historical records remain unchanged.
                    </p>
                    <input
                      value={lifecycleReason}
                      onChange={(e) => setLifecycleReason(e.target.value)}
                      placeholder="Reason for reactivation"
                      className="mt-3 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      disabled={lifecycleLoading || lifecycleReason.trim().length < 3}
                      onClick={() => void applyLifecycle("REACTIVATE")}
                      className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40"
                    >
                      {lifecycleLoading ? "Reactivating…" : "Reactivate project"}
                    </button>
                  </div>
                )}

                {lifecyclePreview.status === "ARCHIVED" && !lifecyclePreview.canReactivate && (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] leading-4 text-slate-600">
                    {lifecyclePreview.blockedReason || "This archived project cannot be reactivated because its prior state is unavailable or terminal."}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
