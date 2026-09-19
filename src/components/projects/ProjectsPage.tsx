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
  attentionToday,
  initialEditingProject,
  onOpenProject,
  onSaveProject,
  onPreviewProjectLifecycle,
  onApplyProjectLifecycle,
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

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || !editing?.projectCode.trim() || !editing.projectName.trim()) return;
    if (!isClassifiedProjectTaxTreatment(editing.taxTreatment)) {
      setFormError("Choose VAT or Non-VAT before saving. Existing unclassified projects require an authorized confirmation.");
      return;
    }
    setFormError("");
    onSaveProject({
      ...editing,
      projectCode: editing.projectCode.trim(),
      projectName: editing.projectName.trim(),
      currency: (editing.currency || "PHP").toUpperCase(),
      contractValue: Math.max(0, Number(editing.contractValue) || 0),
      projectBudget: Math.max(0, Number(editing.projectBudget) || 0),
    });
    setEditing(null);
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

  const projectCodeInputRef = useRef<HTMLInputElement>(null);
  const lifecycleCloseButtonRef = useRef<HTMLButtonElement>(null);
  const editingDialogRef = useDialogFocus({ open: Boolean(editing), onClose: () => setEditing(null), initialFocusRef: projectCodeInputRef });
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
        onEditProject={setEditing}
        onOpenLifecycle={openLifecycle}
      />

      {/* Editing Dialog Modal */}
      {canManage && editing && (
        <div
          ref={editingDialogRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-dialog-title"
        >
          <form
            onSubmit={save}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Project Register</p>
                <h2 id="project-dialog-title" className="text-lg font-black text-slate-950">
                  {editing.id && editing.projectCode.trim() ? `Edit ${editing.projectCode}` : "Create New Project"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close project modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Project Code *</label>
                <input
                  ref={projectCodeInputRef}
                  required
                  value={editing.projectCode}
                  onChange={(e) => setEditing({ ...editing, projectCode: e.target.value })}
                  placeholder="e.g. PRJ-2026-001"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Currency *</label>
                <input
                  required
                  value={editing.currency}
                  onChange={(e) => setEditing({ ...editing, currency: e.target.value.toUpperCase() })}
                  placeholder="PHP"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700" htmlFor="project-tax-treatment">Tax treatment *</label>
                <select
                  id="project-tax-treatment"
                  required
                  value={editing.taxTreatment === "VAT" || editing.taxTreatment === "NON_VAT" ? editing.taxTreatment : ""}
                  onChange={(e) => { setFormError(""); setEditing({ ...editing, taxTreatment: e.target.value as Project["taxTreatment"] }); }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  <option value="">Choose…</option>
                  <option value="VAT">VAT</option>
                  <option value="NON_VAT">Non-VAT</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700">Project Name *</label>
              <input
                required
                value={editing.projectName}
                onChange={(e) => setEditing({ ...editing, projectName: e.target.value })}
                placeholder="e.g. Water Treatment Plant Upgrade"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Contract Value (Awarded)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing.contractValue ?? ""}
                  onChange={(e) => setEditing({ ...editing, contractValue: Number(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Approved Cost Budget</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing.projectBudget ?? ""}
                  onChange={(e) => setEditing({ ...editing, projectBudget: Number(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
            </div>

            {formError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{formError}</div>}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Client Name</label>
                <input
                  value={editing.clientName || ""}
                  onChange={(e) => setEditing({ ...editing, clientName: e.target.value })}
                  placeholder="e.g. Metro Water District"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Project Manager</label>
                <input
                  value={editing.projectManager || ""}
                  onChange={(e) => setEditing({ ...editing, projectManager: e.target.value })}
                  placeholder="e.g. Engr. Santos"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
            </div>

            <details open={Boolean(editing.billingContactName || editing.billingEmail || editing.billingAddress)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer list-none text-xs font-bold text-slate-700 [&::-webkit-details-marker]:hidden">Billing details <span className="ml-1 text-[10px] font-semibold text-slate-500">optional</span></summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Billing Contact</label>
                <input
                  value={editing.billingContactName || ""}
                  onChange={(e) => setEditing({ ...editing, billingContactName: e.target.value })}
                  placeholder="e.g. Maria Santos"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Billing Email</label>
                <input
                  type="email"
                  value={editing.billingEmail || ""}
                  onChange={(e) => setEditing({ ...editing, billingEmail: e.target.value })}
                  placeholder="billing@example.com"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold text-slate-700">Billing Address</label>
                <textarea
                  value={editing.billingAddress || ""}
                  onChange={(e) => setEditing({ ...editing, billingAddress: e.target.value })}
                  rows={2}
                  placeholder="Client billing address"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
              </div>
            </details>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Location / City</label>
                <input
                  value={editing.location || ""}
                  onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                  placeholder="e.g. Quezon City"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700">Status</label>
                <select
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value as ProjectStatus })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  {PROJECT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <details open={Boolean(editing.description || editing.notes)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer list-none text-xs font-bold text-slate-700 [&::-webkit-details-marker]:hidden">Operational notes <span className="ml-1 text-[10px] font-semibold text-slate-500">optional</span></summary>
              <div className="mt-3">
              <label className="block text-[10px] font-bold text-slate-700">Operational Notes / Scope</label>
              <textarea
                value={editing.description || editing.notes || ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value, notes: e.target.value })}
                rows={2}
                placeholder="Scope description or operational context..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
              />
              </div>
            </details>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button variant="secondary" type="button" label="Cancel" onClick={() => setEditing(null)} />
              <Button variant="primary" type="submit" label="Save project" />
            </div>
          </form>
        </div>
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
