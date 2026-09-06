import { reconciliationStatusForTransaction, type FinancialAccount, type FinancialBalanceSnapshot, type FinancialTransaction, type FinancialTransactionMatch } from "../lib/cashBanking.ts";
import type { PayrollSchedule } from "../lib/payrollSchedule.ts";
import type { EngineeringDailySiteLogsWorkspaceData } from "../lib/dailySiteLogs.ts";
import type { EngineeringDocumentsWorkspaceData } from "../lib/engineeringDocuments.ts";
import type { InventoryItem, InventoryMovement } from "../lib/inventory.ts";
import type { RecurringPayrollComponent, WorkerCompensationProfile } from "../lib/payrollAutomation.ts";
import type {
  AttendanceRecord,
  Expense,
  FinancialFxSnapshot,
  InvoiceData,
  InvoiceProjectAllocation,
  LeaveRequest,
  OvertimeRequest,
  PayrollEntry,
  PayrollPeriod,
  PayrollRun,
  Project,
  ProjectEquipment,
  ProjectMaterial,
  ProjectWorkerAssignment,
  Subcontract,
  SubcontractProgressClaim,
  SubcontractProgressClaimStatus,
  SubcontractVariation,
  SubcontractVariationStatus,
  Worker,
  WorkEntry,
} from "../types.ts";
import { createDemoWorkspace } from "./data/createDemoWorkspace.ts";
import { demoTimestamp } from "./data/demoDates.ts";
import { DEMO_COMPANY_ID, type DemoPreparedAssistantAction, type DemoWorkspaceData } from "./demoTypes.ts";
import { assignmentDependencySummary, assignmentForLifecycle, componentForLifecycle, isCompensationProfileConsumed, isRecurringComponentConsumed, profileForLifecycle, workerDependencySummary, workerForLifecycle, type PayrollLifecycleRequest } from "../lib/payrollLifecycle.ts";
import { buildProjectLifecyclePreview, type ProjectLifecycleAction } from "../lib/projects.ts";
import type { FinancialCorrectionAction } from "../lib/financialLifecycle.ts";
import { applyLocalClientBillingTransition, type ClientBilling, type ClientBillingEvent, type ClientBillingStatus, upsertClientBilling } from "../lib/clientBilling.ts";
import { applyLocalClientCollectionRecord, applyLocalClientCollectionReverse, type ClientCollection, type ClientCollectionEvent, upsertClientCollection } from "../lib/clientCollections.ts";
import { applySubcontractTransition } from "../lib/subcontracts.ts";
import { applySubcontractClaimTransition } from "../lib/subcontractClaims.ts";
import { applySubcontractVariationTransition } from "../lib/subcontractVariations.ts";

export type DemoWorkspaceMutation =
  | { type: "SAVE_PROJECT"; value: Project }
  | { type: "ARCHIVE_PROJECT"; value: Project }
  | { type: "PROJECT_LIFECYCLE"; project: Project; action: ProjectLifecycleAction }
  | { type: "SAVE_INVOICE"; value: InvoiceData }
  /** Legacy test-only demo transition; production routes use FINANCIAL_CORRECTION. */
  | { type: "DELETE_INVOICE"; id: string }
  | { type: "FINANCIAL_CORRECTION"; entity: "INVOICE" | "EXPENSE"; id: string; action: FinancialCorrectionAction; reason?: string }
  | { type: "SAVE_INVOICE_ALLOCATIONS"; invoiceId: string; value: InvoiceProjectAllocation[] }
  | { type: "SAVE_EXPENSE"; value: Expense }
  | { type: "SAVE_FINANCIAL_FX_SNAPSHOT"; value: FinancialFxSnapshot }
  | { type: "SAVE_SUBCONTRACT"; value: Subcontract }
  | { type: "TRANSITION_SUBCONTRACT"; id: string; targetStatus: Subcontract["status"]; reason?: string }
  | { type: "DELETE_SUBCONTRACT"; id: string }
  | { type: "SAVE_SUBCONTRACT_CLAIM"; value: SubcontractProgressClaim }
  | { type: "TRANSITION_SUBCONTRACT_CLAIM"; id: string; targetStatus: SubcontractProgressClaimStatus; reason?: string; lineApprovals?: Array<{ claimLineId: string; approvedAmount: number }> }
  | { type: "DELETE_SUBCONTRACT_CLAIM"; id: string }
  | { type: "SAVE_SUBCONTRACT_VARIATION"; value: SubcontractVariation }
  | { type: "TRANSITION_SUBCONTRACT_VARIATION"; id: string; targetStatus: SubcontractVariationStatus; reason?: string }
  | { type: "DELETE_SUBCONTRACT_VARIATION"; id: string }
  | { type: "SAVE_CLIENT_BILLING"; value: ClientBilling; event?: ClientBillingEvent }
  | { type: "TRANSITION_CLIENT_BILLING"; id: string; targetStatus: ClientBillingStatus; reason?: string }
  | { type: "SAVE_CLIENT_COLLECTION"; value: ClientCollection; event?: ClientCollectionEvent }
  | { type: "RECORD_CLIENT_COLLECTION"; id: string }
  | { type: "REVERSE_CLIENT_COLLECTION"; id: string; reason: string }
  | { type: "SAVE_WORKER"; value: Worker }
  | { type: "SAVE_ASSIGNMENT"; value: ProjectWorkerAssignment }
  | { type: "SAVE_COMPENSATION_PROFILE"; value: WorkerCompensationProfile }
  | { type: "SAVE_RECURRING_COMPONENT"; value: RecurringPayrollComponent }
  | { type: "PAYROLL_LIFECYCLE"; request: PayrollLifecycleRequest }
  | { type: "SAVE_PERIOD"; value: PayrollPeriod }
  | { type: "SAVE_SCHEDULE"; value: PayrollSchedule }
  | { type: "SAVE_WORK_ENTRY"; value: WorkEntry }
  | { type: "SAVE_ATTENDANCE"; value: AttendanceRecord }
  | { type: "SAVE_ATTENDANCE_BATCH"; value: AttendanceRecord[] }
  | { type: "SAVE_LEAVE"; value: LeaveRequest }
  | { type: "SAVE_OVERTIME"; value: OvertimeRequest }
  | { type: "SAVE_PAYROLL_ENTRY"; value: PayrollEntry }
  | { type: "UPDATE_PAYROLL_RUN"; value: PayrollRun }
  | { type: "SAVE_FINANCIAL_ACCOUNT"; value: FinancialAccount }
  | { type: "SAVE_FINANCIAL_SNAPSHOT"; value: FinancialBalanceSnapshot }
  | { type: "SAVE_FINANCIAL_TRANSACTION"; value: FinancialTransaction }
  | { type: "SAVE_FINANCIAL_MATCH"; match: FinancialTransactionMatch; transaction: FinancialTransaction }
  | { type: "REVERSE_FINANCIAL_SETTLEMENT"; matchId: string; reason: string }
  | { type: "SAVE_ENGINEERING_DOCUMENTS"; value: EngineeringDocumentsWorkspaceData }
  | { type: "SAVE_DAILY_SITE_LOGS"; value: EngineeringDailySiteLogsWorkspaceData }
  | { type: "SAVE_MATERIAL"; value: ProjectMaterial }
  | { type: "SAVE_EQUIPMENT"; value: ProjectEquipment }
  | { type: "SAVE_INVENTORY_ITEM"; value: InventoryItem }
  | { type: "RECORD_INVENTORY_MOVEMENT"; value: InventoryMovement };

function upsert<T extends { id: string }>(items: readonly T[], value: T): T[] {
  const found = items.some((item) => item.id === value.id);
  return found ? items.map((item) => item.id === value.id ? value : item) : [value, ...items];
}

function upsertOptionalId<T extends { id?: string }>(items: readonly T[], value: T): T[] {
  if (!value.id) return [value, ...items];
  const found = items.some((item) => item.id === value.id);
  return found ? items.map((item) => item.id === value.id ? value : item) : [value, ...items];
}

export function demoProjectLifecyclePreview(state: DemoWorkspaceData, project: Project) {
  return buildProjectLifecyclePreview(project, {
    invoiceProjectAllocations: state.invoiceAllocations.filter((allocation) => allocation.projectId === project.id).length,
    expenses: state.expenses.filter((expense) => expense.projectId === project.id).length,
    projectWorkerAssignments: state.payroll.assignments.filter((assignment) => assignment.projectId === project.id).length,
    workEntries: state.payroll.workEntries.filter((entry) => entry.projectId === project.id).length,
    overtimeRequests: (state.payroll.overtimeRequests || []).filter((request) => request.projectId === project.id).length,
    payrollProjectAllocations: state.payroll.allocations.filter((allocation) => allocation.projectId === project.id).length,
    payrollEntryProjectContexts: state.payroll.entries.filter((entry) => entry.costContext?.projectId === project.id).length,
    workerDefaultProjects: state.payroll.workers.filter((worker) => worker.defaultProjectId === project.id).length,
    compensationProfileDefaultProjects: state.payroll.compensationProfiles.filter((profile) => profile.defaultProjectId === project.id).length,
    engineeringDocuments: state.engineering.documents.filter((document) => document.projectId === project.id).length,
    engineeringRfis: state.coordination.rfis.filter((rfi) => rfi.projectId === project.id).length,
    engineeringSubmittals: state.coordination.submittals.filter((submittal) => submittal.projectId === project.id).length,
    engineeringDailySiteLogs: state.siteLogs.logs.filter((log) => log.projectId === project.id).length,
    projectMaterials: state.materials.filter((material) => material.projectId === project.id).length,
    projectEquipment: state.equipment.filter((equipment) => equipment.projectId === project.id).length,
    inventoryMovements: state.inventoryMovements.filter((movement) => movement.projectId === project.id).length,
    purchaseOrders: (state.purchaseOrders || []).filter((purchaseOrder) => purchaseOrder.projectId === project.id).length,
    subcontracts: (state.subcontracts || []).filter((subcontract) => subcontract.projectId === project.id).length,
    subcontractProgressClaims: (state.subcontractClaims || []).filter((claim) => claim.projectId === project.id).length,
    subcontractVariations: (state.subcontractVariations || []).filter((variation) => variation.projectId === project.id).length,
    clientBillings: (state.clientBillings || []).filter((billing) => billing.projectId === project.id).length,
    clientCollections: (state.clientCollections || []).filter((collection) => collection.projectId === project.id).length,
  });
}

export function reduceDemoWorkspace(state: DemoWorkspaceData, mutation: DemoWorkspaceMutation): DemoWorkspaceData {
  switch (mutation.type) {
    case "SAVE_PROJECT":
      return { ...state, projects: upsert(state.projects, { ...mutation.value, updatedAt: demoTimestamp(state.anchorDate, 16, 0) }) };
    case "ARCHIVE_PROJECT":
      return { ...state, projects: state.projects.map((project) => project.id === mutation.value.id ? { ...project, status: "ARCHIVED", archivedFromStatus: project.status === "ARCHIVED" ? project.archivedFromStatus : project.status, archivedAt: demoTimestamp(state.anchorDate, 16, 5), updatedAt: demoTimestamp(state.anchorDate, 16, 5) } : project) };
    case "PROJECT_LIFECYCLE": {
      const project = state.projects.find((candidate) => candidate.id === mutation.project.id);
      if (!project) return state;
      const preview = demoProjectLifecyclePreview(state, project);
      if (mutation.action === "DELETE_UNUSED") {
        if (!preview.canDelete) return state;
        return { ...state, projects: state.projects.filter((candidate) => candidate.id !== project.id) };
      }
      if (mutation.action === "ARCHIVE") {
        const updatedAt = demoTimestamp(state.anchorDate, 16, 5);
        return { ...state, projects: state.projects.map((candidate) => candidate.id === project.id ? { ...candidate, status: "ARCHIVED", archivedFromStatus: candidate.status === "ARCHIVED" ? candidate.archivedFromStatus : candidate.status, archivedAt: candidate.archivedAt || updatedAt, updatedAt } : candidate) };
      }
      if (!preview.canReactivate) return state;
      return { ...state, projects: state.projects.map((candidate) => candidate.id === project.id ? { ...candidate, status: candidate.archivedFromStatus || "ACTIVE", archivedAt: undefined, archivedFromStatus: undefined, updatedAt: demoTimestamp(state.anchorDate, 16, 5) } : candidate) };
    }
    case "SAVE_INVOICE":
      return { ...state, invoices: upsert(state.invoices, mutation.value) };
    case "DELETE_INVOICE":
      return { ...state, invoices: state.invoices.filter((invoice) => invoice.id !== mutation.id), invoiceAllocations: state.invoiceAllocations.filter((allocation) => allocation.invoiceId !== mutation.id) };
    case "FINANCIAL_CORRECTION": {
      const updatedAt = demoTimestamp(state.anchorDate, 16, mutation.entity === "INVOICE" ? 15 : 20);
      if (mutation.entity === "INVOICE") {
        const invoice = state.invoices.find((candidate) => candidate.id === mutation.id);
        if (!invoice) return state;
        if (mutation.action === "DELETE_UNUSED") return { ...state, invoices: state.invoices.filter((candidate) => candidate.id !== mutation.id), invoiceAllocations: state.invoiceAllocations.filter((allocation) => allocation.invoiceId !== mutation.id) };
        const value = mutation.action === "VOID" ? { ...invoice, lifecycleStatus: "VOID" as const, voidedAt: updatedAt, voidReason: mutation.reason || "Confirmed invoice void", updatedAt } : mutation.action === "ARCHIVE" ? { ...invoice, archivedAt: invoice.archivedAt || updatedAt, updatedAt } : { ...invoice, archivedAt: undefined, updatedAt };
        return { ...state, invoices: state.invoices.map((candidate) => candidate.id === mutation.id ? value : candidate) };
      }
      const expense = state.expenses.find((candidate) => candidate.id === mutation.id);
      if (!expense) return state;
      if (mutation.action === "DELETE_UNUSED") return { ...state, expenses: state.expenses.filter((candidate) => candidate.id !== mutation.id) };
      const value = mutation.action === "VOID" ? { ...expense, status: "VOID" as const, voidedAt: updatedAt, voidReason: mutation.reason || "Confirmed expense void", updatedAt } : mutation.action === "ARCHIVE" ? { ...expense, archivedAt: expense.archivedAt || updatedAt, updatedAt } : { ...expense, archivedAt: undefined, updatedAt };
      return { ...state, expenses: state.expenses.map((candidate) => candidate.id === mutation.id ? value : candidate) };
    }
    case "SAVE_INVOICE_ALLOCATIONS":
      return { ...state, invoiceAllocations: [...state.invoiceAllocations.filter((allocation) => allocation.invoiceId !== mutation.invoiceId), ...mutation.value] };
    case "SAVE_EXPENSE":
      return { ...state, expenses: upsert(state.expenses, mutation.value) };
    case "SAVE_FINANCIAL_FX_SNAPSHOT":
      return { ...state, financialFxSnapshots: upsert(state.financialFxSnapshots || [], mutation.value) };
    case "SAVE_SUBCONTRACT": {
      const existing = (state.subcontracts || []).find((subcontract) => subcontract.id === mutation.value.id);
      if (existing && existing.status !== "DRAFT") return state;
      return { ...state, subcontracts: upsert(state.subcontracts || [], mutation.value) };
    }
    case "TRANSITION_SUBCONTRACT": {
      const current = (state.subcontracts || []).find((subcontract) => subcontract.id === mutation.id);
      if (!current) return state;
      try {
        const updated = applySubcontractTransition(current, mutation.targetStatus, mutation.reason, demoTimestamp(state.anchorDate, 16, 30));
        return { ...state, subcontracts: (state.subcontracts || []).map((subcontract) => subcontract.id === current.id ? updated : subcontract) };
      } catch {
        return state;
      }
    }
    case "DELETE_SUBCONTRACT": {
      const current = (state.subcontracts || []).find((subcontract) => subcontract.id === mutation.id);
      if (!current || current.status !== "DRAFT") return state;
      return { ...state, subcontracts: (state.subcontracts || []).filter((subcontract) => subcontract.id !== mutation.id) };
    }
    case "SAVE_SUBCONTRACT_CLAIM": {
      const existing = (state.subcontractClaims || []).find((claim) => claim.id === mutation.value.id);
      if (existing && existing.status !== "DRAFT") return state;
      return { ...state, subcontractClaims: upsert(state.subcontractClaims || [], mutation.value) };
    }
    case "TRANSITION_SUBCONTRACT_CLAIM": {
      const claims = state.subcontractClaims || [];
      const current = claims.find((claim) => claim.id === mutation.id);
      if (!current) return state;
      const subcontract = (state.subcontracts || []).find((sc) => sc.id === current.subcontractId);
      const otherApproved = claims.filter((c) => c.subcontractId === current.subcontractId && c.id !== current.id && c.status === "APPROVED");
      try {
        const updated = applySubcontractClaimTransition(
          current,
          mutation.targetStatus,
          mutation.reason,
          mutation.lineApprovals,
          subcontract,
          otherApproved,
          state.subcontractVariations || [],
          demoTimestamp(state.anchorDate, 17, 0),
        );
        return { ...state, subcontractClaims: claims.map((claim) => (claim.id === current.id ? updated : claim)) };
      } catch {
        return state;
      }
    }
    case "DELETE_SUBCONTRACT_CLAIM": {
      const current = (state.subcontractClaims || []).find((claim) => claim.id === mutation.id);
      if (!current || current.status !== "DRAFT") return state;
      return { ...state, subcontractClaims: (state.subcontractClaims || []).filter((claim) => claim.id !== mutation.id) };
    }
    case "SAVE_SUBCONTRACT_VARIATION": {
      const existing = (state.subcontractVariations || []).find((variation) => variation.id === mutation.value.id);
      if (existing && existing.status !== "DRAFT") return state;
      return { ...state, subcontractVariations: upsert(state.subcontractVariations || [], mutation.value) };
    }
    case "TRANSITION_SUBCONTRACT_VARIATION": {
      const variations = state.subcontractVariations || [];
      const current = variations.find((variation) => variation.id === mutation.id);
      if (!current) return state;
      const subcontract = (state.subcontracts || []).find((sc) => sc.id === current.subcontractId);
      const otherApproved = variations.filter((v) => v.subcontractId === current.subcontractId && v.id !== current.id && v.status === "APPROVED");
      const approvedClaims = (state.subcontractClaims || []).filter((c) => c.subcontractId === current.subcontractId && c.status === "APPROVED");
      try {
        const updated = applySubcontractVariationTransition(
          current,
          mutation.targetStatus,
          mutation.reason,
          subcontract,
          otherApproved,
          approvedClaims,
          demoTimestamp(state.anchorDate, 17, 15),
        );
        return { ...state, subcontractVariations: variations.map((variation) => (variation.id === current.id ? updated : variation)) };
      } catch {
        return state;
      }
    }
    case "DELETE_SUBCONTRACT_VARIATION": {
      const current = (state.subcontractVariations || []).find((variation) => variation.id === mutation.id);
      if (!current || current.status !== "DRAFT") return state;
      return { ...state, subcontractVariations: (state.subcontractVariations || []).filter((variation) => variation.id !== mutation.id) };
    }
    case "SAVE_CLIENT_BILLING": {
      const existing = (state.clientBillings || []).find((billing) => billing.id === mutation.value.id);
      if (existing && existing.status !== "DRAFT") return state;
      const nextEvents = mutation.event ? [mutation.event, ...(state.clientBillingEvents || [])] : state.clientBillingEvents || [];
      return { ...state, clientBillings: upsertClientBilling(state.clientBillings || [], mutation.value), clientBillingEvents: nextEvents };
    }
    case "TRANSITION_CLIENT_BILLING": {
      const current = (state.clientBillings || []).find((billing) => billing.id === mutation.id);
      const project = current ? state.projects.find((candidate) => candidate.id === current.projectId) : undefined;
      if (!current || !project) return state;
      try {
        const result = applyLocalClientBillingTransition(current, mutation.targetStatus, project, state.clientBillings || [], mutation.reason, demoTimestamp(state.anchorDate, 17, 30));
        return { ...state, clientBillings: (state.clientBillings || []).map((billing) => billing.id === current.id ? result.billing : billing), clientBillingEvents: [result.event, ...(state.clientBillingEvents || [])] };
      } catch {
        return state;
      }
    }
    case "SAVE_CLIENT_COLLECTION": {
      const existing = (state.clientCollections || []).find((c) => c.id === mutation.value.id);
      if (existing && existing.status !== "DRAFT") return state;
      const nextEvents = mutation.event ? [mutation.event, ...(state.clientCollectionEvents || [])] : state.clientCollectionEvents || [];
      return { ...state, clientCollections: upsertClientCollection(state.clientCollections || [], mutation.value), clientCollectionEvents: nextEvents };
    }
    case "RECORD_CLIENT_COLLECTION": {
      const current = (state.clientCollections || []).find((c) => c.id === mutation.id);
      const project = current ? state.projects.find((candidate) => candidate.id === current.projectId) : undefined;
      if (!current || !project) return state;
      try {
        const result = applyLocalClientCollectionRecord(current, project, state.clientBillings || [], state.clientCollections || [], demoTimestamp(state.anchorDate, 17, 35));
        return { ...state, clientCollections: (state.clientCollections || []).map((c) => c.id === current.id ? result.collection : c), clientCollectionEvents: [result.event, ...(state.clientCollectionEvents || [])] };
      } catch {
        return state;
      }
    }
    case "REVERSE_CLIENT_COLLECTION": {
      const current = (state.clientCollections || []).find((c) => c.id === mutation.id);
      if (!current) return state;
      try {
        const result = applyLocalClientCollectionReverse(current, mutation.reason, demoTimestamp(state.anchorDate, 17, 40));
        return { ...state, clientCollections: (state.clientCollections || []).map((c) => c.id === current.id ? result.collection : c), clientCollectionEvents: [result.event, ...(state.clientCollectionEvents || [])] };
      } catch {
        return state;
      }
    }
    case "SAVE_WORKER":
      return { ...state, payroll: { ...state.payroll, workers: upsert(state.payroll.workers, mutation.value) } };
    case "SAVE_ASSIGNMENT":
      return { ...state, payroll: { ...state.payroll, assignments: upsert(state.payroll.assignments, mutation.value) } };
    case "SAVE_COMPENSATION_PROFILE":
      return { ...state, payroll: { ...state.payroll, compensationProfiles: upsertOptionalId(state.payroll.compensationProfiles, mutation.value) } };
    case "SAVE_RECURRING_COMPONENT":
      return { ...state, payroll: { ...state.payroll, recurringComponents: upsert(state.payroll.recurringComponents, mutation.value) } };
    case "PAYROLL_LIFECYCLE": {
      const request = mutation.request;
      const payroll = state.payroll;
      const effectiveDate = request.effectiveDate || state.anchorDate;
      if (request.entity === "WORKER") {
        const worker = payroll.workers.find((item) => item.id === request.id);
        if (!worker) return state;
        const summary = workerDependencySummary(request.id, {
          workers: payroll.workers,
          assignments: payroll.assignments,
          attendanceRecords: payroll.attendanceRecords,
          leaveRequests: payroll.leaveRequests,
          overtimeRequests: payroll.overtimeRequests,
          workEntries: payroll.workEntries,
          payrollEntries: payroll.entries,
          payrollRuns: payroll.runs,
          periods: payroll.periods,
          compensationProfiles: payroll.compensationProfiles,
          recurringComponents: payroll.recurringComponents,
          departmentManagerWorkerIds: payroll.departments.map((department) => department.managerWorkerId).filter((id): id is string => Boolean(id)),
        });
        if (request.action === "DELETE_UNUSED" && !summary.canDelete) return state;
        return { ...state, payroll: { ...payroll, workers: request.action === "DELETE_UNUSED" ? payroll.workers.filter((item) => item.id !== request.id) : payroll.workers.map((item) => item.id === request.id ? workerForLifecycle(item, request.action as "OFFBOARD" | "REACTIVATE", effectiveDate) : item) } };
      }
      if (request.entity === "PROJECT_ASSIGNMENT") {
        const assignment = payroll.assignments.find((item) => item.id === request.id);
        if (!assignment) return state;
        const dependency = assignmentDependencySummary(assignment, { workEntries: payroll.workEntries, overtimeRequests: payroll.overtimeRequests, payrollEntries: payroll.entries, allocations: payroll.allocations });
        if (request.action === "DELETE_UNUSED") return dependency.canDelete ? { ...state, payroll: { ...payroll, assignments: payroll.assignments.filter((item) => item.id !== request.id) } } : state;
        return { ...state, payroll: { ...payroll, assignments: payroll.assignments.map((item) => item.id === request.id ? assignmentForLifecycle(item, effectiveDate) : item) } };
      }
      if (request.entity === "COMPENSATION_PROFILE") {
        const profile = payroll.compensationProfiles.find((item) => item.id === request.id);
        if (!profile) return state;
        if (request.action === "DELETE_UNUSED") return isCompensationProfileConsumed({ profile, payrollEntries: payroll.entries, payrollRuns: payroll.runs, periods: payroll.periods }) ? state : { ...state, payroll: { ...payroll, compensationProfiles: payroll.compensationProfiles.filter((item) => item.id !== request.id) } };
        return { ...state, payroll: { ...payroll, compensationProfiles: payroll.compensationProfiles.map((item) => item.id === request.id ? profileForLifecycle(item, effectiveDate) : item) } };
      }
      if (request.entity === "RECURRING_COMPONENT") {
        const component = payroll.recurringComponents.find((item) => item.id === request.id);
        if (!component) return state;
        if (request.action === "DELETE_UNUSED") return isRecurringComponentConsumed({ component, payrollEntries: payroll.entries, payrollRuns: payroll.runs, periods: payroll.periods }) ? state : { ...state, payroll: { ...payroll, recurringComponents: payroll.recurringComponents.filter((item) => item.id !== request.id) } };
        return { ...state, payroll: { ...payroll, recurringComponents: payroll.recurringComponents.map((item) => item.id === request.id ? componentForLifecycle(item, effectiveDate) : item) } };
      }
      if (request.entity === "WORK_ENTRY") {
        const entry = payroll.workEntries.find((item) => item.id === request.id);
        if (!entry) return state;
        if (request.action === "DELETE_DRAFT") return entry.status === "DRAFT" ? { ...state, payroll: { ...payroll, workEntries: payroll.workEntries.filter((item) => item.id !== request.id) } } : state;
        return { ...state, payroll: { ...payroll, workEntries: payroll.workEntries.map((item) => item.id === request.id ? { ...item, status: "VOID", voidedAt: demoTimestamp(state.anchorDate, 16, 20), voidReason: request.reason } : item) } };
      }
      if (request.entity === "ATTENDANCE") {
        const record = (payroll.attendanceRecords || []).find((item) => item.id === request.id);
        if (!record) return state;
        if (request.action === "DELETE_DRAFT") return record.recordStatus === "DRAFT" ? { ...state, payroll: { ...payroll, attendanceRecords: (payroll.attendanceRecords || []).filter((item) => item.id !== request.id) } } : state;
        return { ...state, payroll: { ...payroll, attendanceRecords: (payroll.attendanceRecords || []).map((item) => item.id === request.id ? { ...item, recordStatus: "VOID", voidedAt: demoTimestamp(state.anchorDate, 16, 20), voidReason: request.reason } : item) } };
      }
      if (request.entity === "LEAVE") {
        const leave = (payroll.leaveRequests || []).find((item) => item.id === request.id);
        if (!leave) return state;
        if (request.action === "DELETE_DRAFT") return leave.status === "DRAFT" ? { ...state, payroll: { ...payroll, leaveRequests: (payroll.leaveRequests || []).filter((item) => item.id !== request.id) } } : state;
        return { ...state, payroll: { ...payroll, leaveRequests: (payroll.leaveRequests || []).map((item) => item.id === request.id ? { ...item, status: "CANCELLED", cancelledAt: demoTimestamp(state.anchorDate, 16, 20), cancellationReason: request.reason } : item) } };
      }
      if (request.entity === "OVERTIME") {
        const overtime = (payroll.overtimeRequests || []).find((item) => item.id === request.id);
        if (!overtime) return state;
        if (request.action === "DELETE_DRAFT") return overtime.status === "DRAFT" ? { ...state, payroll: { ...payroll, overtimeRequests: (payroll.overtimeRequests || []).filter((item) => item.id !== request.id) } } : state;
        return { ...state, payroll: { ...payroll, overtimeRequests: (payroll.overtimeRequests || []).map((item) => item.id === request.id ? { ...item, status: "CANCELLED", cancelledAt: demoTimestamp(state.anchorDate, 16, 20), cancellationReason: request.reason } : item) } };
      }
      return state;
    }
    case "SAVE_PERIOD":
      return { ...state, payroll: { ...state.payroll, periods: upsert(state.payroll.periods, mutation.value) } };
    case "SAVE_SCHEDULE":
      return { ...state, payroll: { ...state.payroll, schedules: upsert(state.payroll.schedules, mutation.value) } };
    case "SAVE_WORK_ENTRY":
      return { ...state, payroll: { ...state.payroll, workEntries: upsert(state.payroll.workEntries, mutation.value) } };
    case "SAVE_ATTENDANCE":
      return { ...state, payroll: { ...state.payroll, attendanceRecords: upsert(state.payroll.attendanceRecords || [], mutation.value) } };
    case "SAVE_ATTENDANCE_BATCH": {
      let next = [...(state.payroll.attendanceRecords || [])];
      for (const record of mutation.value) next = upsert(next, record);
      return { ...state, payroll: { ...state.payroll, attendanceRecords: next } };
    }
    case "SAVE_LEAVE":
      return { ...state, payroll: { ...state.payroll, leaveRequests: upsert(state.payroll.leaveRequests || [], mutation.value) } };
    case "SAVE_OVERTIME":
      return { ...state, payroll: { ...state.payroll, overtimeRequests: upsert(state.payroll.overtimeRequests || [], mutation.value) } };
    case "SAVE_PAYROLL_ENTRY":
      return { ...state, payroll: { ...state.payroll, entries: upsert(state.payroll.entries, mutation.value) } };
    case "UPDATE_PAYROLL_RUN":
      return { ...state, payroll: { ...state.payroll, runs: upsert(state.payroll.runs, mutation.value) } };
    case "SAVE_FINANCIAL_ACCOUNT":
      return { ...state, cash: { ...state.cash, accounts: upsert(state.cash.accounts, mutation.value) } };
    case "SAVE_FINANCIAL_SNAPSHOT":
      return { ...state, cash: { ...state.cash, snapshots: upsert(state.cash.snapshots, mutation.value) } };
    case "SAVE_FINANCIAL_TRANSACTION":
      return { ...state, cash: { ...state.cash, transactions: upsert(state.cash.transactions, mutation.value) } };
    case "SAVE_FINANCIAL_MATCH": {
      const nextMatches = upsert(state.cash.matches, mutation.match);
      const nextTransactions = upsert(state.cash.transactions, mutation.transaction);
      return { ...state, cash: { ...state.cash, matches: nextMatches, transactions: nextTransactions } };
    }
    case "REVERSE_FINANCIAL_SETTLEMENT": {
      const reversedAt = demoTimestamp(state.anchorDate, 16, 25);
      const targetMatch = state.cash.matches.find((m) => m.id === mutation.matchId);
      if (!targetMatch) return state;
      const updatedMatch: FinancialTransactionMatch = {
        ...targetMatch,
        status: "REVERSED",
        reversedAt,
        reversalReason: mutation.reason,
        updatedAt: reversedAt,
      };
      const nextMatches = state.cash.matches.map((m) => m.id === mutation.matchId ? updatedMatch : m);
      const affectedTx = state.cash.transactions.find((t) => t.id === targetMatch.transactionId);
      const nextTransactions = affectedTx
        ? state.cash.transactions.map((t) => t.id === affectedTx.id ? { ...t, reconciliationStatus: reconciliationStatusForTransaction(t, nextMatches), updatedAt: reversedAt } : t)
        : state.cash.transactions;
      return { ...state, cash: { ...state.cash, matches: nextMatches, transactions: nextTransactions } };
    }
    case "SAVE_ENGINEERING_DOCUMENTS":
      return { ...state, engineering: mutation.value };
    case "SAVE_DAILY_SITE_LOGS":
      return { ...state, siteLogs: mutation.value };
    case "SAVE_MATERIAL":
      return { ...state, materials: upsert(state.materials, mutation.value) };
    case "SAVE_EQUIPMENT":
      return { ...state, equipment: upsert(state.equipment, mutation.value) };
    case "SAVE_INVENTORY_ITEM":
      return { ...state, inventoryItems: upsert(state.inventoryItems, mutation.value) };
    case "RECORD_INVENTORY_MOVEMENT":
      return { ...state, inventoryMovements: upsert(state.inventoryMovements, mutation.value) };
    default:
      return state;
  }
}

export function resetDemoWorkspace(anchorDate: string): DemoWorkspaceData {
  return createDemoWorkspace(anchorDate);
}

export function isSafeStoredDemoWorkspace(value: unknown, expectedAnchorDate: string): value is DemoWorkspaceData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoWorkspaceData>;
  return candidate.version === 1
    && candidate.anchorDate === expectedAnchorDate
    && candidate.company?.id === DEMO_COMPANY_ID
    && Array.isArray(candidate.projects)
    && Array.isArray(candidate.invoices)
    && Boolean(candidate.payroll && candidate.cash && candidate.engineering && candidate.siteLogs);
}

export function prepareAddWorkerAction(
  state: DemoWorkspaceData,
  input: { firstName: string; lastName: string; rate: number; jobTitle?: string },
): DemoPreparedAssistantAction {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const rate = Number(input.rate);
  if (!firstName || !lastName || !Number.isFinite(rate) || rate <= 0) throw new Error("A worker name and positive hourly rate are required.");
  const normalizedName = `${firstName} ${lastName}`;
  const duplicate = state.payroll.workers.find((worker) => worker.displayName.toLowerCase() === normalizedName.toLowerCase());
  if (duplicate) throw new Error(`${normalizedName} already exists in Demo Workforce.`);
  const sequence = state.payroll.workers.length + 1;
  return {
    id: `demo-prepared-worker-${String(sequence).padStart(3, "0")}`,
    status: "PREPARED",
    kind: "ADD_WORKER",
    summary: `Add ${normalizedName} as an hourly ${input.jobTitle || "Field Worker"} at ₱${rate.toLocaleString("en-PH")}/hour.`,
    createdAt: demoTimestamp(state.anchorDate, 13, 0),
    payload: {
      firstName,
      lastName,
      displayName: normalizedName,
      employeeCode: `MEC-D${String(sequence).padStart(3, "0")}`,
      jobTitle: input.jobTitle || "Field Worker",
      payType: "HOURLY",
      rate,
    },
  };
}

export function executePreparedAssistantAction(state: DemoWorkspaceData, action: DemoPreparedAssistantAction): DemoWorkspaceData {
  if (action.status !== "PREPARED") throw new Error("Demo Assistant actions must be PREPARED before execution.");
  if (action.kind !== "ADD_WORKER") throw new Error("Unsupported Demo Assistant action.");
  const worker: Worker = {
    id: `demo-worker-added-${action.payload.employeeCode.toLowerCase()}`,
    employeeCode: action.payload.employeeCode,
    firstName: action.payload.firstName,
    lastName: action.payload.lastName,
    displayName: action.payload.displayName,
    employmentType: "HOURLY",
    employmentStatus: "ACTIVE",
    jobTitle: action.payload.jobTitle,
    department: "Field Operations",
    defaultPayType: action.payload.payType,
    defaultRate: action.payload.rate,
    active: true,
    hireDate: state.anchorDate,
    workingDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
    workingHoursStart: "07:00",
    workingHoursEnd: "16:00",
    notes: "Added through the sandboxed Demo Assistant after explicit confirmation.",
    createdAt: demoTimestamp(state.anchorDate, 13, 5),
    updatedAt: demoTimestamp(state.anchorDate, 13, 5),
  };
  return reduceDemoWorkspace(state, { type: "SAVE_WORKER", value: worker });
}
