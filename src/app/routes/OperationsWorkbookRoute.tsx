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
import type { Expense, Project, ProjectCostCode, PurchaseOrder, RFQ } from "../../types.ts";
import { hasAllPermissions, hasAnyPermission, PERMISSION_KEYS, type PermissionKey } from "../../utils/accessControl.ts";
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
  type ProjectControlsWorkbookSheetId,
} from "../../lib/projectsWorkbookEditing.ts";
import {
  applyExpenseWorkbookDraftValue,
  canEditExpenseWorkbookField,
  expenseWorkbookOptionsForField,
  ExpenseWorkbookEditingError,
  readExpenseWorkbookValue,
  saveExpenseWorkbookRows,
} from "../../lib/expensesWorkbookEditing.ts";
import {
  applyProcurementWorkbookDraftValue,
  canEditProcurementWorkbookField,
  ProcurementWorkbookEditingError,
  readProcurementWorkbookValue,
  saveProcurementWorkbookRows,
  type ProcurementWorkbookSheetId,
  type ProcurementWorkbookRow,
} from "../../lib/procurementWorkbookEditing.ts";

type WorkbookRow = Project | ProjectCostCode | Expense | RFQ | PurchaseOrder;
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

interface DemoExpenseWorkbookRecords {
  contextKey: string;
  sourceExpenses: readonly Expense[];
  records: ExpensesWorkbookRecords;
}

interface DemoProcurementWorkbookRecords {
  contextKey: string;
  sourceRFQs: readonly RFQ[];
  sourcePurchaseOrders: readonly PurchaseOrder[];
  records: ProcurementRefreshContext;
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

function issuesToCellMap(issues: readonly { rowId: string; fieldId: string; message: string }[]): Record<string, string> {
  return Object.fromEntries(issues.map((item) => [getWorksheetCellId(item.rowId, item.fieldId), item.message]));
}

function isConcurrencyConflict(error: unknown): boolean {
  if (error instanceof ProjectControlsWorkbookApplyError) return error.kind === "conflict";
  if (error instanceof ExpenseWorkbookEditingError) return error.kind === "conflict";
  if (error instanceof ProcurementWorkbookEditingError) return error.kind === "conflict";
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
  onSaveExpenseDraft?: (expense: Expense) => Promise<void> | void;
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
  onSaveExpenseDraft,
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
  const hasProcurementReadAndManage = hasAllPermissions(permissions, [PERMISSION_KEYS.procurementRead, PERMISSION_KEYS.procurementWrite]);
  const procurementProductionSaveReady = selectedSheet?.id === "rfqs"
    ? Boolean(onRefreshProcurement && onSaveRFQ)
    : selectedSheet?.id === "purchase-orders"
      ? Boolean(onRefreshProcurement && onSavePurchaseOrder)
      : false;
  const canSaveProcurementSheet = !workspaceLoading
    && hasProcurementReadAndManage
    && (demoMode || procurementProductionSaveReady);
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
  const hasExpenseReadAndManage = hasAllPermissions(permissions, [PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.expensesWrite]);
  const expenseProductionSaveReady = Boolean(onRefreshExpenses && onSaveExpenseDraft);
  const canSaveExpenseSheet = !workspaceLoading && hasExpenseReadAndManage && (demoMode || expenseProductionSaveReady);

  const expenses = useMemo<ExpensesWorkbookRecords>(() => expenseRecords || ({
    expenses: [],
    projects,
    costCodes,
    invoices: [],
    purchaseOrders: [],
    vendors: [],
    expectedCompanyId: companyId,
  }), [companyId, costCodes, expenseRecords, projects]);
  const [demoExpenseRecordsState, setDemoExpenseRecordsState] = useState<DemoExpenseWorkbookRecords>(() => ({
    contextKey: currentContextKey,
    sourceExpenses: expenses.expenses,
    records: expenses,
  }));
  const demoExpenseRecords = demoExpenseRecordsState.contextKey === currentContextKey ? demoExpenseRecordsState.records : expenses;
  const procurement = useMemo<ProcurementRefreshContext>(() => procurementRecords || ({
    rfqs: [],
    purchaseOrders: [],
    projects,
    vendors: [],
    expectedCompanyId: companyId,
  }), [companyId, procurementRecords, projects]);
  const [demoProcurementRecordsState, setDemoProcurementRecordsState] = useState<DemoProcurementWorkbookRecords>(() => ({
    contextKey: currentContextKey,
    sourceRFQs: procurement.rfqs,
    sourcePurchaseOrders: procurement.purchaseOrders,
    records: procurement,
  }));
  const demoProcurementRecords = demoProcurementRecordsState.contextKey === currentContextKey
    ? demoProcurementRecordsState.records
    : procurement;

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
    if (demoExpenseRecordsState.contextKey !== currentContextKey
      || demoExpenseRecordsState.sourceExpenses !== expenses.expenses) {
      setDemoExpenseRecordsState({ contextKey: currentContextKey, sourceExpenses: expenses.expenses, records: expenses });
    }
  }, [currentContextKey, demoExpenseRecordsState, expenses]);

  useEffect(() => {
    if (demoProcurementRecordsState.contextKey !== currentContextKey
      || demoProcurementRecordsState.sourceRFQs !== procurement.rfqs
      || demoProcurementRecordsState.sourcePurchaseOrders !== procurement.purchaseOrders) {
      setDemoProcurementRecordsState({
        contextKey: currentContextKey,
        sourceRFQs: procurement.rfqs,
        sourcePurchaseOrders: procurement.purchaseOrders,
        records: procurement,
      });
    }
  }, [currentContextKey, demoProcurementRecordsState, procurement]);

  useEffect(() => {
    if (!selectedSheet || !onNavigatePath || requestedSheetId === selectedSheet.id) return;
    onNavigatePath(appPathForWorkbookSheet(selectedSheet.id), true);
  }, [onNavigatePath, requestedSheetId, selectedSheet]);

  const workbookAdapter = useMemo<OperationsWorkbookSheetAdapter<WorkbookRow> | null>(() => {
    if (!selectedSheet) return null;

    if (selectedSheet.id === "rfqs" || selectedSheet.id === "purchase-orders") {
      const sheetId: ProcurementWorkbookSheetId = selectedSheet.id;
      const sourceRecords = demoMode ? demoProcurementRecords : procurement;
      const rows: readonly ProcurementWorkbookRow[] = sheetId === "rfqs" ? sourceRecords.rfqs : sourceRecords.purchaseOrders;
      const saveRows = canSaveProcurementSheet ? async (nextRows: readonly WorkbookRow[]) => {
        setCellIssues({});
        setFeedback(null);
        if (currentContextKeyRef.current !== currentContextKey) return;

        setIsSaving(true);
        try {
          const result = await saveProcurementWorkbookRows({
            writeMode: demoMode ? "synthetic-demo" : "existing-domain",
            sheetId,
            stagedRows: nextRows as readonly ProcurementWorkbookRow[],
            baseRecords: sourceRecords,
            permissions,
            expectedCompanyId: companyId,
            saveSyntheticRecords: demoMode ? async (records) => {
              setDemoProcurementRecordsState({
                contextKey: currentContextKey,
                sourceRFQs: procurement.rfqs,
                sourcePurchaseOrders: procurement.purchaseOrders,
                records,
              });
            } : undefined,
            refresh: onRefreshProcurement,
            saveRFQ: onSaveRFQ,
            savePurchaseOrder: onSavePurchaseOrder,
            isContextCurrent: () => currentContextKeyRef.current === currentContextKey,
          });
          if (currentContextKeyRef.current !== currentContextKey) return;
          stagedEditsRef.current = false;
          setHasStagedEdits(false);
          setEditorRevision((revision) => revision + 1);
          setCellIssues({});
          const label = sheetId === "rfqs" ? "RFQ" : "Purchase Order";
          setFeedback({
            kind: "success",
            message: result.writeMode === "synthetic-demo"
              ? "Demo Procurement changes saved in this browser."
              : result.appliedCount ? `${label} changes saved.` : `No ${label} changes to save.`,
          });
        } catch (error) {
          if (currentContextKeyRef.current !== currentContextKey) return;
          const applyError = error instanceof ProcurementWorkbookEditingError ? error : null;
          if (applyError?.issues.length) setCellIssues(issuesToCellMap(applyError.issues));

          const appliedCount = applyError?.appliedCount || 0;
          const label = sheetId === "rfqs" ? "RFQ" : "Purchase Order";
          const procurementRows = sheetId === "rfqs" ? sourceRecords.rfqs : sourceRecords.purchaseOrders;
          const recordLabel = (id: string) => {
            const row = procurementRows.find((candidate) => candidate.id === id);
            return row && "rfqNumber" in row ? row.rfqNumber : row && "poNumber" in row ? row.poNumber : id;
          };
          const appliedLabels = (applyError?.appliedRowIds || []).map(recordLabel);
          const unappliedLabels = (applyError?.unappliedRowIds || []).map(recordLabel);
          const savedSummary = appliedLabels.length
            ? `Saved row${appliedLabels.length === 1 ? "" : "s"}: ${appliedLabels.join(", ")}.`
            : `Saved ${appliedCount} ${label} row${appliedCount === 1 ? "" : "s"}.`;
          if (appliedCount > 0 || applyError?.allRowsApplied) {
            stagedEditsRef.current = false;
            setHasStagedEdits(false);
            setEditorRevision((revision) => revision + 1);
            const unsavedCount = Math.max(1, (applyError?.totalCount || appliedCount + 1) - appliedCount);
            const failedRowSummary = unappliedLabels.length
              ? `Not saved: ${unappliedLabels.join(", ")}.`
              : applyError?.failedRowId
                ? `${label} ${recordLabel(applyError.failedRowId)} was not saved.`
                : `${unsavedCount} later ${label} row${unsavedCount === 1 ? " was" : "s were"} not saved.`;
            setFeedback({
              kind: "conflict",
              message: applyError?.allRowsApplied
                ? `${savedSummary} The latest rows could not be confirmed. Reload and review before continuing.`
                : `${savedSummary} ${failedRowSummary} Reload and review before re-entering changes.`,
            });
            if (!demoMode && onRefreshProcurement) {
              try { await onRefreshProcurement(); } catch { /* Keep the save result visible if refresh also fails. */ }
            }
          } else if (applyError?.kind === "conflict" || isConcurrencyConflict(error)) {
            stagedEditsRef.current = false;
            setHasStagedEdits(false);
            setEditorRevision((revision) => revision + 1);
            setFeedback({
              kind: "conflict",
              message: applyError?.message || `${label} data changed while you were editing. Review current rows before re-entering changes.`,
            });
          } else if (applyError?.phase === "preflight" && applyError.kind === "apply") {
            setFeedback({ kind: "error", message: applyError.message });
          } else if (applyError?.kind === "context") {
            return;
          } else {
            setFeedback({ kind: "error", message: applyError?.message || `${label} worksheet changes could not be saved. Review the highlighted values and try again.` });
          }
        } finally {
          setIsSaving(false);
        }
      } : undefined;

      return {
        sheet: selectedSheet,
        rows,
        writeMode: !canSaveProcurementSheet ? "none" : demoMode ? "synthetic-demo" : "existing-domain",
        ...(demoMode && canSaveProcurementSheet ? { dataScope: "synthetic-demo" as const } : {}),
        readValue: (row, fieldId) => readProcurementWorkbookValue(row as ProcurementWorkbookRow, fieldId),
        ...(canSaveProcurementSheet ? {
          applyDraftValue: (row: WorkbookRow, fieldId: string, value: unknown): WorkbookRow =>
            applyProcurementWorkbookDraftValue(sheetId, row as ProcurementWorkbookRow, fieldId, value) as WorkbookRow,
          onSave: saveRows,
        } : {}),
        canEditField: (field, row, _rowIndex, currentPermissions) =>
          canEditProcurementWorkbookField(sheetId, field.id, row as ProcurementWorkbookRow, currentPermissions),
      };
    }

    if (selectedSheet.id === "expenses") {
      const sourceRecords = demoMode ? demoExpenseRecords : expenses;
      const rows: readonly Expense[] = sourceRecords.expenses;
      const canReadProjects = hasAnyPermission(permissions, [PERMISSION_KEYS.projectsRead]);
      const saveExpenseRows = canSaveExpenseSheet ? async (nextRows: readonly WorkbookRow[]) => {
        setCellIssues({});
        setFeedback(null);
        if (currentContextKeyRef.current !== currentContextKey) return;

        setIsSaving(true);
        try {
          const result = await saveExpenseWorkbookRows({
            writeMode: demoMode ? "synthetic-demo" : "existing-domain",
            stagedRows: nextRows as readonly Expense[],
            baseRecords: sourceRecords,
            permissions,
            expectedCompanyId: companyId,
            saveSyntheticRows: demoMode ? async (syntheticRows) => {
              setDemoExpenseRecordsState({
                contextKey: currentContextKey,
                sourceExpenses: expenses.expenses,
                records: { ...demoExpenseRecords, expenses: syntheticRows },
              });
            } : undefined,
            refresh: onRefreshExpenses,
            saveExpense: onSaveExpenseDraft,
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
              ? "Demo Expense changes saved in this browser."
              : result.appliedExpenseCount ? "Expense changes saved." : "No Expense changes to save.",
          });
        } catch (error) {
          if (currentContextKeyRef.current !== currentContextKey) return;
          const applyError = error instanceof ExpenseWorkbookEditingError ? error : null;
          if (applyError?.issues.length) setCellIssues(issuesToCellMap(applyError.issues));

          const appliedCount = applyError?.appliedCount || 0;
          if (appliedCount > 0 || applyError?.allRowsApplied) {
            stagedEditsRef.current = false;
            setHasStagedEdits(false);
            setEditorRevision((revision) => revision + 1);
            setFeedback({
              kind: "conflict",
              message: applyError?.allRowsApplied
                ? "Expense changes were saved, but the latest rows could not be confirmed. Reload latest before continuing."
                : "Saved " + appliedCount + " Expense row" + (appliedCount === 1 ? "" : "s") + "; a later row was not saved. Reload and review before re-entering changes.",
            });
            if (onRefreshExpenses) {
              try { await onRefreshExpenses(); } catch { /* Keep the save result visible if refresh also fails. */ }
            }
          } else if (applyError?.kind === "conflict" || isConcurrencyConflict(error)) {
            stagedEditsRef.current = false;
            setHasStagedEdits(false);
            setEditorRevision((revision) => revision + 1);
            setFeedback({ kind: "conflict", message: applyError?.message || "Expense data changed while you were editing. Review current rows before re-entering changes." });
          } else if (applyError?.phase === "preflight" && applyError.kind === "apply") {
            setFeedback({ kind: "error", message: applyError.message });
          } else {
            setFeedback({ kind: "error", message: applyError?.message || "Expense worksheet changes could not be saved. Review the highlighted values and try again." });
          }
        } finally {
          setIsSaving(false);
        }
      } : undefined;

      return {
        sheet: selectedSheet,
        rows,
        writeMode: !canSaveExpenseSheet ? "none" : demoMode ? "synthetic-demo" : "existing-domain",
        ...(demoMode && canSaveExpenseSheet ? { dataScope: "synthetic-demo" as const } : {}),
        readValue: (row, fieldId) => readExpenseWorkbookValue(row as Expense, fieldId, canReadProjects),
        selectOptionsForField: (field, row) => expenseWorkbookOptionsForField(
          field.id,
          row as Expense,
          sourceRecords.projects,
          sourceRecords.costCodes,
          canReadProjects,
        ),
        ...(canSaveExpenseSheet ? {
          applyDraftValue: (row: WorkbookRow, fieldId: string, value: unknown): WorkbookRow =>
            applyExpenseWorkbookDraftValue(row as Expense, fieldId, value, sourceRecords.costCodes),
          onSave: saveExpenseRows,
        } : {}),
        canEditField: (field, row, _rowIndex, currentPermissions) =>
          canEditExpenseWorkbookField(field.id, row as Expense, currentPermissions),
      };
    }

    if (selectedSheet.id !== "projects" && selectedSheet.id !== "cost-codes") return null;
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
          stagedRows: nextRows as readonly (Project | ProjectCostCode)[],
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
    canSaveProcurementSheet,
    canSaveExpenseSheet,
    canSaveProjectSheets,
    companyId,
    currentContextKey,
    demoMode,
    demoExpenseRecords,
    demoProcurementRecords,
    demoRecords,
    expenses,
    onApplyProjectWorkbookGroup,
    onRefreshExpenses,
    onRefreshProcurement,
    onRefreshProjects,
    onSavePurchaseOrder,
    onSaveRFQ,
    onSaveExpenseDraft,
    permissionSnapshotKey,
    permissions,
    projectRecords,
    procurement,
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
    ? "Demo · edits stay in this browser"
    : selectedSheet
      ? worksheetCanSave ? "" : "read only"
      : "Workbook access";

  const reloadLatest = async () => {
    const refreshCurrentSheet = selectedSheet?.id === "expenses"
      ? onRefreshExpenses
      : selectedSheet?.id === "rfqs" || selectedSheet?.id === "purchase-orders"
        ? onRefreshProcurement
        : onRefreshProjects;
    if (!refreshCurrentSheet || demoMode) return;
    const expectedContextKey = currentContextKey;
    setIsSaving(true);
    try {
      await refreshCurrentSheet();
      if (currentContextKeyRef.current !== expectedContextKey) return;
      stagedEditsRef.current = false;
      setHasStagedEdits(false);
      setCellIssues({});
      setFeedback(null);
      setEditorRevision((revision) => revision + 1);
    } catch {
      if (currentContextKeyRef.current === expectedContextKey) {
        setFeedback({ kind: "error", message: "Could not reload current worksheet rows. Try again before continuing." });
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
        className="flex h-[min(82dvh,56rem)] min-h-[28rem] min-w-0 flex-col overflow-hidden border border-slate-300 bg-white text-slate-900"
        style={{ colorScheme: "light" }}
      >
        <header className="hqs-border flex min-h-8 shrink-0 min-w-0 flex-wrap items-center justify-between gap-2 border-b px-2.5 py-1.5">
          <h1 className="min-w-0 text-sm font-semibold">Operations Workbook</h1>
          {statusText && <span role="status" data-workbook-status="true" className="hqs-secondary-text max-w-full text-[10px] font-medium sm:text-[11px]">{statusText}</span>}
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
              fillHeight
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

          <footer className="hqs-border min-w-0 shrink-0 border-t bg-white px-1">
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
