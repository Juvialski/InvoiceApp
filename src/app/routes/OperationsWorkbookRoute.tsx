import React, { useEffect, useMemo, useRef, useState } from "react";
import { WorksheetEditor, WorksheetTabs } from "../../components/ui/WorksheetEditor.tsx";
import { getWorksheetCellId } from "../../components/ui/worksheetEditorModel.ts";
import { OperationsWorkbookTransfer } from "./OperationsWorkbookTransfer.tsx";
import {
  availableOperationsWorkbookSheets,
  canAccessOperationsWorkbook,
  OPERATIONS_WORKBOOK_ENABLED_ADAPTERS,
  operationsWorkbookColumns,
  operationsWorkbookContextKey,
  resolveOperationsWorkbookSheetSelection,
  type OperationsWorkbookSheetAdapter,
} from "../../lib/operationsWorkbookModel.ts";
import type { Project, ProjectCostCode } from "../../types.ts";
import { hasAllPermissions, PERMISSION_KEYS, type PermissionKey } from "../../utils/accessControl.ts";
import type { ExpensesWorkbookRecords } from "../../lib/expensesWorkbook.ts";
import type { ProcurementRefreshContext } from "../../lib/procurementWorkbook.ts";
import type { ProjectsWorkbookRecords } from "../../components/projects/ProjectsWorkbookPanel.tsx";
import { appPathForWorkbookSheet, workbookSheetFromSearch } from "../../utils/appRouting.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";
import type { ProjectsApplyCallbacks } from "../../lib/projectsWorkbook.ts";
import type { ExpensesApplyCallbacks } from "../../lib/expensesWorkbook.ts";
import type { ProcurementApplyCallbacks } from "../../lib/procurementWorkbook.ts";
import {
  applyCostCodeWorkbookDraftValue,
  applyProjectWorkbookDraftValue,
  ProjectControlsWorkbookApplyError,
  saveProjectControlsWorkbookRows,
  type ProjectControlsWorkbookIssue,
  type ProjectControlsWorkbookSheetId,
} from "../../lib/projectsWorkbookEditing.ts";

type WorkbookRow = Project | ProjectCostCode;
type WorkbookIssueMap = Readonly<Record<string, string>>;

interface SaveFeedback {
  kind: "success" | "error" | "conflict";
  message: string;
}

interface DemoWorkbookRecords {
  contextKey: string;
  sourceProjects: readonly Project[];
  sourceCostCodes: readonly ProjectCostCode[];
  records: ProjectsWorkbookRecords;
}

function projectValue(project: Project, fieldId: string): unknown {
  switch (fieldId) {
    case "projectCode": return project.projectCode;
    case "projectName": return project.projectName;
    case "description": return project.description || "";
    case "clientName": return project.clientName || "";
    case "clientReference": return project.clientReference || "";
    case "billingContactName": return project.billingContactName || "";
    case "billingEmail": return project.billingEmail || "";
    case "billingAddress": return project.billingAddress || "";
    case "location": return project.location || "";
    case "siteAddress": return project.siteAddress || "";
    case "projectManager": return project.projectManager || "";
    case "startDate": return project.startDate || "";
    case "targetEndDate": return project.targetEndDate || "";
    case "actualEndDate": return project.actualEndDate || "";
    case "contractValue": return project.contractValue ?? "";
    case "projectBudget": return project.projectBudget;
    case "currency": return project.currency;
    case "taxTreatment": return project.taxTreatment || "UNCLASSIFIED";
    case "notes": return project.notes || "";
    case "status": return project.status;
    case "actualCost":
    case "committedCost":
    case "billed":
    case "collected":
    case "outstandingReceivables":
    case "remainingToBill":
    case "health": return "Unavailable";
    default: return undefined;
  }
}

function costCodeValue(costCode: ProjectCostCode, fieldId: string, projects: readonly Project[]): unknown {
  const project = projects.find((candidate) => candidate.id === costCode.projectId);
  switch (fieldId) {
    case "projectCode": return project?.projectCode || "Unknown project";
    case "currency": return project?.currency || "PHP";
    case "code": return costCode.code;
    case "name": return costCode.name;
    case "description": return costCode.description || "";
    case "approvedBudgetAmount": return costCode.approvedBudgetAmount;
    case "forecastAmount": return costCode.forecastAmount ?? "";
    case "status": return costCode.status;
    case "actualCost":
    case "committedCost":
    case "variance": return "Unavailable";
    default: return undefined;
  }
}

function issuesToCellMap(issues: readonly ProjectControlsWorkbookIssue[]): Record<string, string> {
  return Object.fromEntries(issues.map((item) => [getWorksheetCellId(item.rowId, item.fieldId), item.message]));
}

function isConcurrencyConflict(error: unknown): boolean {
  if (error instanceof ProjectControlsWorkbookApplyError) return error.kind === "conflict";
  if (!(error instanceof Error)) return false;
  return /changed after|expected.version.mismatch|stale|conflict/i.test(error.message)
    || ("code" in error && (error as Error & { code?: unknown }).code === "40001");
}

export interface OperationsWorkbookRouteProps {
  projects: readonly Project[];
  costCodes?: readonly ProjectCostCode[];
  expenseRecords?: ExpensesWorkbookRecords;
  procurementRecords?: ProcurementRefreshContext;
  companyId?: string;
  permissions: readonly PermissionKey[];
  search: string;
  demoMode?: boolean;
  workspaceLoading?: boolean;
  onNavigatePath?: AppNavigate;
  onRefreshProjects?: () => Promise<ProjectsWorkbookRecords>;
  onApplyProjectWorkbookGroup?: ProjectsApplyCallbacks["applyGroup"];
  onRefreshExpenses?: () => Promise<ExpensesWorkbookRecords>;
  onApplyExpenseWorkbook?: ExpensesApplyCallbacks["saveExpense"];
  onRefreshProcurement?: () => Promise<ProcurementRefreshContext>;
  onSaveRFQ?: ProcurementApplyCallbacks["saveRFQ"];
  onSavePurchaseOrder?: ProcurementApplyCallbacks["savePurchaseOrder"];
}

export function OperationsWorkbookRoute({
  projects,
  permissions,
  search,
  costCodes = [],
  expenseRecords,
  procurementRecords,
  companyId,
  demoMode = false,
  workspaceLoading = false,
  onNavigatePath,
  onRefreshProjects,
  onApplyProjectWorkbookGroup,
  onRefreshExpenses,
  onApplyExpenseWorkbook,
  onRefreshProcurement,
  onSaveRFQ,
  onSavePurchaseOrder,
}: OperationsWorkbookRouteProps) {
  const permissionSnapshotKey = [...new Set(permissions)].sort().join(",");
  const currentContextKey = operationsWorkbookContextKey(companyId, permissions, demoMode);
  const currentContextKeyRef = useRef(currentContextKey);
  const previousContextKeyRef = useRef(currentContextKey);
  const stagedEditsRef = useRef(false);
  currentContextKeyRef.current = currentContextKey;

  const visibleSheets = useMemo(
    () => availableOperationsWorkbookSheets(permissions, { enabledAdapters: OPERATIONS_WORKBOOK_ENABLED_ADAPTERS }),
    [permissionSnapshotKey],
  );
  const requestedSheetId = workbookSheetFromSearch(search);
  const selectedSheet = resolveOperationsWorkbookSheetSelection(requestedSheetId, visibleSheets);
  const projectRecords = useMemo<ProjectsWorkbookRecords>(() => ({ projects, costCodes }), [costCodes, projects]);
  const [demoRecordsState, setDemoRecordsState] = useState<DemoWorkbookRecords>(() => ({
    contextKey: currentContextKey,
    sourceProjects: projects,
    sourceCostCodes: costCodes,
    records: projectRecords,
  }));
  const demoRecords = demoRecordsState.contextKey === currentContextKey ? demoRecordsState.records : projectRecords;
  const [isSaving, setIsSaving] = useState(false);
  const [hasStagedEdits, setHasStagedEdits] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [cellIssues, setCellIssues] = useState<WorkbookIssueMap>({});
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null);
  const hasReadAndManage = hasAllPermissions(permissions, [PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.projectsWrite]);
  const productionSaveReady = Boolean(onRefreshProjects && onApplyProjectWorkbookGroup);
  const canSaveProjectSheets = !workspaceLoading && hasReadAndManage && (demoMode || productionSaveReady);

  const expenses = useMemo<ExpensesWorkbookRecords>(() => expenseRecords || ({
    expenses: [],
    projects,
    costCodes,
    invoices: [],
    purchaseOrders: [],
    vendors: [],
    expectedCompanyId: companyId,
  }), [companyId, costCodes, expenseRecords, projects]);
  const procurement = useMemo<ProcurementRefreshContext>(() => procurementRecords || ({
    rfqs: [],
    purchaseOrders: [],
    projects,
    vendors: [],
  }), [procurementRecords, projects]);

  useEffect(() => {
    if (previousContextKeyRef.current === currentContextKey) return;
    previousContextKeyRef.current = currentContextKey;
    stagedEditsRef.current = false;
    setHasStagedEdits(false);
    setIsSaving(false);
    setCellIssues({});
    setFeedback(null);
    setEditorRevision((revision) => revision + 1);
  }, [currentContextKey]);

  useEffect(() => {
    if (demoRecordsState.contextKey !== currentContextKey
      || demoRecordsState.sourceProjects !== projects
      || demoRecordsState.sourceCostCodes !== costCodes) {
      setDemoRecordsState({ contextKey: currentContextKey, sourceProjects: projects, sourceCostCodes: costCodes, records: projectRecords });
    }
  }, [costCodes, currentContextKey, demoRecordsState, projectRecords, projects]);

  useEffect(() => {
    if (!selectedSheet || !onNavigatePath || requestedSheetId === selectedSheet.id) return;
    onNavigatePath(appPathForWorkbookSheet(selectedSheet.id), true);
  }, [onNavigatePath, requestedSheetId, selectedSheet]);

  const workbookAdapter = useMemo<OperationsWorkbookSheetAdapter<WorkbookRow> | null>(() => {
    if (!selectedSheet || (selectedSheet.id !== "projects" && selectedSheet.id !== "cost-codes")) return null;
    const sheetId: ProjectControlsWorkbookSheetId = selectedSheet.id;
    const projectSheet = sheetId === "projects";
    const sourceRecords = demoMode ? demoRecords : projectRecords;
    const rows: readonly WorkbookRow[] = projectSheet ? sourceRecords.projects : sourceRecords.costCodes;

    const saveRows = canSaveProjectSheets ? async (nextRows: readonly WorkbookRow[]) => {
      setCellIssues({});
      setFeedback(null);
      if (currentContextKeyRef.current !== currentContextKey) return;

      setIsSaving(true);
      try {
        const result = await saveProjectControlsWorkbookRows({
          writeMode: demoMode ? "synthetic-demo" : "existing-domain",
          sheetId,
          stagedRows: nextRows,
          baseRecords: projectRecords,
          expectedCompanyId: companyId,
          saveSyntheticRows: demoMode ? async (syntheticRows) => {
            const nextRecords = projectSheet
              ? { ...demoRecords, projects: syntheticRows as readonly Project[] }
              : { ...demoRecords, costCodes: syntheticRows as readonly ProjectCostCode[] };
            setDemoRecordsState({ contextKey: currentContextKey, sourceProjects: projects, sourceCostCodes: costCodes, records: nextRecords });
          } : undefined,
          refresh: onRefreshProjects,
          applyGroup: onApplyProjectWorkbookGroup,
          isContextCurrent: () => currentContextKeyRef.current === currentContextKey,
        });
        if (currentContextKeyRef.current !== currentContextKey) return;
        stagedEditsRef.current = false;
        setHasStagedEdits(false);
        setEditorRevision((revision) => revision + 1);
        setCellIssues({});
        setFeedback({
          kind: "success",
          message: result.writeMode === "synthetic-demo"
            ? "Demo changes saved in this browser."
            : result.appliedGroupCount ? "Changes saved." : "No changes to save.",
        });
      } catch (error) {
        if (currentContextKeyRef.current !== currentContextKey) return;
        const applyError = error instanceof ProjectControlsWorkbookApplyError ? error : null;
        if (applyError?.issues.length) setCellIssues(issuesToCellMap(applyError.issues));

        const appliedCount = applyError?.appliedGroupCount || 0;
        if (applyError?.allGroupsApplied) {
          stagedEditsRef.current = false;
          setHasStagedEdits(false);
          setFeedback({
            kind: "conflict",
            message: `All ${appliedCount} project group${appliedCount === 1 ? " was" : "s were"} saved, but the worksheet could not refresh. Reload latest rows to confirm current values.`,
          });
        } else if (appliedCount > 0) {
          stagedEditsRef.current = false;
          setHasStagedEdits(false);
          setFeedback({
            kind: "conflict",
            message: `Saved ${appliedCount} project group${appliedCount === 1 ? "" : "s"}; a later group was not applied. Remaining staged edits were cleared when rows refreshed. Reload and review before re-entering them.`,
          });
        } else if (applyError?.phase === "preflight" && applyError.kind === "apply") {
          setFeedback({ kind: "error", message: "Could not refresh current project data before saving. Your staged edits remain in the sheet; try again when current data is available." });
        } else if (applyError?.kind === "conflict" || isConcurrencyConflict(error)) {
          stagedEditsRef.current = false;
          setHasStagedEdits(false);
          setFeedback({
            kind: "conflict",
            message: applyError?.phase === "apply"
              ? `${applyError.message} The staged edits were cleared after the refresh; review current rows before re-entering them.`
              : applyError.message || "Project data changed while you were editing. Review the refreshed rows and re-enter the edits.",
          });
        } else if (applyError?.phase === "apply") {
          setFeedback({ kind: "conflict", message: "A project group could not be saved. The sheet refreshed and cleared staged edits; review current rows before re-entering them." });
        } else {
          setFeedback({ kind: "error", message: applyError?.message || "Project worksheet changes could not be saved. Review current rows and try again." });
        }

        if (!applyError?.issues.length && applyError?.phase === "apply" && onRefreshProjects) {
          try {
            await onRefreshProjects();
            stagedEditsRef.current = false;
            setHasStagedEdits(false);
          } catch {
            // Keep the actionable save state visible when refresh also fails.
          }
        }
      } finally {
        setIsSaving(false);
      }
    } : undefined;

    return {
      sheet: selectedSheet,
      rows,
      writeMode: !canSaveProjectSheets ? "none" : demoMode ? "synthetic-demo" : "existing-domain",
      ...(demoMode && canSaveProjectSheets ? { dataScope: "synthetic-demo" as const } : {}),
      readValue: (row, fieldId) => projectSheet
        ? projectValue(row as Project, fieldId)
        : costCodeValue(row as ProjectCostCode, fieldId, sourceRecords.projects),
      ...(canSaveProjectSheets ? {
        applyDraftValue: (row: WorkbookRow, fieldId: string, value: unknown): WorkbookRow => projectSheet
          ? applyProjectWorkbookDraftValue(row as Project, fieldId, value)
          : applyCostCodeWorkbookDraftValue(row as ProjectCostCode, fieldId, value),
        onSave: saveRows,
      } : {}),
      canEditField: () => true,
    };
  }, [
    canSaveProjectSheets,
    companyId,
    currentContextKey,
    demoMode,
    demoRecords,
    onApplyProjectWorkbookGroup,
    onRefreshProjects,
    projectRecords,
    selectedSheet,
  ]);

  const columns = useMemo(
    () => workbookAdapter ? operationsWorkbookColumns(workbookAdapter, permissions) : [],
    [permissionSnapshotKey, workbookAdapter],
  );

  if (!canAccessOperationsWorkbook(permissions)) {
    return (
      <section aria-label="Operations Workbook" className="min-w-0 border border-slate-200 bg-white p-6 text-sm text-slate-700">
        <h1 className="text-base font-semibold text-slate-950">Operations Workbook</h1>
        <p className="mt-2">This workspace is not available for the current access profile.</p>
      </section>
    );
  }

  const rows = !selectedSheet || !workbookAdapter || workspaceLoading ? [] : workbookAdapter.rows;
  const sheetTabs = visibleSheets.map((sheet) => ({ id: sheet.id, label: sheet.shortName || sheet.name }));
  const worksheetCanSave = Boolean(workbookAdapter?.onSave);
  const statusText = demoMode
    ? "Synthetic demo · edits stay in this browser"
    : selectedSheet
      ? `${selectedSheet.name} · ${worksheetCanSave ? "editable" : "read only"}`
      : "Combined workbook access";

  const reloadLatest = async () => {
    if (!onRefreshProjects || demoMode) return;
    const expectedContextKey = currentContextKey;
    setIsSaving(true);
    try {
      await onRefreshProjects();
      if (currentContextKeyRef.current !== expectedContextKey) return;
      stagedEditsRef.current = false;
      setHasStagedEdits(false);
      setCellIssues({});
      setFeedback(null);
      setEditorRevision((revision) => revision + 1);
    } catch {
      if (currentContextKeyRef.current === expectedContextKey) {
        setFeedback({ kind: "error", message: "Could not reload project data. Try again before applying changes." });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section aria-label="Operations Workbook" className="min-w-0">
      <div
        data-operations-workbook="true"
        data-workbook-sheet={selectedSheet?.id}
        className="flex min-h-[min(70vh,42rem)] min-w-0 flex-col overflow-hidden border border-slate-300 bg-white text-slate-900 shadow-sm"
        style={{ colorScheme: "light" }}
      >
        <header className="flex min-w-0 flex-col items-start gap-1 border-b border-slate-200 px-3 py-2 sm:min-h-12 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4">
          <h1 className="min-w-0 text-sm font-semibold">Operations Workbook</h1>
          <div role="status" className="max-w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600 sm:shrink-0 sm:text-xs">
            {statusText}
          </div>
        </header>

        {selectedSheet && workbookAdapter ? <>
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <WorksheetEditor
              key={`${currentContextKey}:${selectedSheet.id}:${editorRevision}`}
              ariaLabel={`${selectedSheet.name} worksheet`}
              rows={rows}
              columns={columns}
              rowKey={(row) => row.id}
              showActionBar={worksheetCanSave}
              toolbar={feedback ? <span role={feedback.kind === "error" || feedback.kind === "conflict" ? "alert" : "status"} className={`text-[11px] font-semibold ${feedback.kind === "success" ? "text-emerald-800" : "text-rose-800"}`}>{feedback.message}</span> : undefined}
              actions={feedback?.kind === "conflict" && worksheetCanSave && !demoMode
                ? <button type="button" onClick={() => void reloadLatest()} disabled={isSaving} className="inline-flex min-h-9 items-center rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-800 disabled:opacity-50">Reload latest</button>
                : undefined}
              onRowsChange={worksheetCanSave ? () => { stagedEditsRef.current = true; setHasStagedEdits(true); } : undefined}
              onCellChange={() => {
                setCellIssues({});
                setFeedback(null);
              }}
              cellIssues={cellIssues}
              onSave={workbookAdapter.onSave}
              onCancel={worksheetCanSave ? () => { stagedEditsRef.current = false; setHasStagedEdits(false); setCellIssues({}); setFeedback(null); } : undefined}
              saveLabel={demoMode ? "Save demo edits" : "Save changes"}
              cancelLabel="Discard edits"
              isSaving={isSaving}
              disabled={workspaceLoading}
              emptyState={workspaceLoading ? "Loading worksheet rows…" : selectedSheet.emptyState}
              className="h-full min-w-0 rounded-none"
              density="compact"
            />
          </div>

          <footer className="min-w-0 border-t border-slate-200 bg-white px-1">
            <WorksheetTabs
              ariaLabel="Operations Workbook sheets"
              tabs={sheetTabs}
              value={selectedSheet.id}
              onChange={(sheetId) => {
                if (!visibleSheets.some((sheet) => sheet.id === sheetId)) return;
                if (sheetId !== selectedSheet.id && stagedEditsRef.current) {
                  setFeedback({ kind: "error", message: "Save or discard your worksheet edits before switching sheets." });
                  return;
                }
                onNavigatePath?.(appPathForWorkbookSheet(sheetId));
              }}
              className="border-b-0"
            />
          </footer>
        </> : <div className="min-h-0 flex-1" />}
      </div>

      <OperationsWorkbookTransfer
        permissions={permissions}
        companyId={companyId}
        projectRecords={projectRecords}
        expenseRecords={expenses}
        procurementRecords={procurement}
        onRefreshProjects={onRefreshProjects}
        onApplyProjectWorkbookGroup={onApplyProjectWorkbookGroup}
        onRefreshExpenses={onRefreshExpenses}
        onApplyExpenseWorkbook={onApplyExpenseWorkbook}
        onRefreshProcurement={onRefreshProcurement}
        onSaveRFQ={onSaveRFQ}
        onSavePurchaseOrder={onSavePurchaseOrder}
        demoMode={demoMode}
        disabled={workspaceLoading || isSaving || hasStagedEdits}
      />
    </section>
  );
}
