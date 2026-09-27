import React, { useEffect, useMemo, useState } from "react";
import { WorksheetEditor, WorksheetTabs } from "../../components/ui/WorksheetEditor.tsx";
import { OperationsWorkbookTransfer } from "./OperationsWorkbookTransfer.tsx";
import {
  availableOperationsWorkbookSheets,
  canAccessOperationsWorkbook,
  OPERATIONS_WORKBOOK_ENABLED_ADAPTERS,
  operationsWorkbookColumns,
  resolveOperationsWorkbookSheetSelection,
  type OperationsWorkbookSheetAdapter,
} from "../../lib/operationsWorkbookModel.ts";
import type { Project, ProjectCostCode } from "../../types.ts";
import type { PermissionKey } from "../../utils/accessControl.ts";
import type { ExpensesWorkbookRecords } from "../../lib/expensesWorkbook.ts";
import type { ProcurementRefreshContext } from "../../lib/procurementWorkbook.ts";
import type { ProjectsWorkbookRecords } from "../../components/projects/ProjectsWorkbookPanel.tsx";
import { appPathForWorkbookSheet, workbookSheetFromSearch } from "../../utils/appRouting.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";
import type { ProjectsApplyCallbacks } from "../../lib/projectsWorkbook.ts";
import type { ExpensesApplyCallbacks } from "../../lib/expensesWorkbook.ts";
import type { ProcurementApplyCallbacks } from "../../lib/procurementWorkbook.ts";

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

function projectValue(project: Project, fieldId: string): unknown {
  switch (fieldId) {
    case "projectCode": return project.projectCode;
    case "projectName": return project.projectName;
    case "clientName": return project.clientName || "";
    case "status": return project.status;
    default: return undefined;
  }
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
  const visibleSheets = useMemo(
    () => availableOperationsWorkbookSheets(permissions, { enabledAdapters: OPERATIONS_WORKBOOK_ENABLED_ADAPTERS }),
    [permissions],
  );
  const requestedSheetId = workbookSheetFromSearch(search);
  const selectedSheet = resolveOperationsWorkbookSheetSelection(requestedSheetId, visibleSheets);
  const [demoProjects, setDemoProjects] = useState<readonly Project[]>(projects);
  const projectRecords = useMemo<ProjectsWorkbookRecords>(() => ({ projects, costCodes }), [costCodes, projects]);
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
    setDemoProjects(projects);
  }, [projects]);

  useEffect(() => {
    if (!selectedSheet || !onNavigatePath || requestedSheetId === selectedSheet.id) return;
    onNavigatePath(appPathForWorkbookSheet(selectedSheet.id), true);
  }, [onNavigatePath, requestedSheetId, selectedSheet]);

  const workbookAdapter = useMemo<OperationsWorkbookSheetAdapter<Project> | null>(() => {
    if (!selectedSheet || selectedSheet.id !== "projects") return null;
    return {
      sheet: selectedSheet,
      rows: demoMode ? demoProjects : projects,
      writeMode: demoMode ? "synthetic-demo" : "none",
      ...(demoMode ? { dataScope: "synthetic-demo" as const } : {}),
      readValue: projectValue,
      ...(demoMode ? {
        applyDraftValue: (project: Project, fieldId: string, value: unknown) => fieldId === "projectName"
          ? { ...project, projectName: String(value ?? "") }
          : project,
      } : {}),
      canEditField: (field, project) => demoMode
        && field.id === "projectName"
        && project.status !== "ARCHIVED"
        && !project.archivedAt,
      ...(demoMode ? { onSave: (rows: readonly Project[]) => setDemoProjects(rows.slice()) } : {}),
    };
  }, [demoMode, demoProjects, projects, selectedSheet]);

  const columns = useMemo(
    () => workbookAdapter ? operationsWorkbookColumns(workbookAdapter, permissions) : [],
    [permissions, workbookAdapter],
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

  return (
    <section
      aria-label="Operations Workbook"
      data-operations-workbook="true"
      data-workbook-sheet={selectedSheet?.id}
      className="flex min-h-[min(70vh,42rem)] min-w-0 flex-col overflow-hidden border border-slate-300 bg-white text-slate-900 shadow-sm"
      style={{ colorScheme: "light" }}
    >
      <header className="flex min-w-0 flex-col items-start gap-1 border-b border-slate-200 px-3 py-2 sm:min-h-12 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4">
        <h1 className="min-w-0 text-sm font-semibold">Operations Workbook</h1>
        <div role="status" className="max-w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600 sm:shrink-0 sm:text-xs">
          {demoMode ? "Synthetic demo · edits stay in this browser" : selectedSheet ? `${selectedSheet.name} · read only` : "Combined workbook access"}
        </div>
      </header>

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
        disabled={workspaceLoading}
      />

      {selectedSheet && workbookAdapter ? <>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <WorksheetEditor
            ariaLabel={`${selectedSheet.name} worksheet`}
            rows={rows}
            columns={columns}
            rowKey={(project) => project.id}
            showActionBar={demoMode}
            toolbar={demoMode ? <span className="text-[10px] font-medium text-slate-500">Sample project names can be edited for QA.</span> : undefined}
            onSave={demoMode ? (nextRows) => setDemoProjects(nextRows.slice()) : undefined}
            saveLabel="Save demo edits"
            emptyState={workspaceLoading ? "Loading project rows…" : selectedSheet.emptyState}
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
              if (visibleSheets.some((sheet) => sheet.id === sheetId)) onNavigatePath?.(appPathForWorkbookSheet(sheetId));
            }}
            className="border-b-0"
          />
        </footer>
      </> : <div className="min-h-0 flex-1" />}
    </section>
  );
}
