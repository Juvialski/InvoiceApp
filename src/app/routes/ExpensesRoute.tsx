import React from "react";
import { ExpensesPage } from "../../components/expenses/ExpensesPage";
import type { Expense, FinancialFxSnapshot, InvoiceData, InvoiceProjectAllocation, Project, ProjectCostCode, PurchaseOrder, Vendor } from "../../types";
import type { FinancialFxSnapshotInput } from "../../lib/financialFx.ts";
import type { FinancialCorrectionAction, FinancialCorrectionPreview, FinancialCorrectionResult } from "../../lib/financialLifecycle.ts";
import { useAppPermissions } from "../AppPermissionContext.tsx";
import { hasAllPermissions, hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";
import type { ExpensesWorkbookRecords } from "../../lib/expensesWorkbook.ts";
import type { SupplierInvoiceSettlementMatch, SupplierInvoiceSettlementProjection } from "../../lib/supplierInvoiceSettlement.ts";

export interface ExpensesRouteProps {
  expenses: Expense[];
  projects: Project[];
  invoices?: readonly InvoiceData[];
  projectAllocations?: readonly InvoiceProjectAllocation[];
  purchaseOrders?: readonly PurchaseOrder[];
  vendors?: readonly Vendor[];
  costCodes?: ProjectCostCode[];
  initialProjectId?: string;
  selectedExpenseId?: string | null;
  expenseReturnPath?: string;
  expensesLoaded?: boolean;
  onNavigatePath?: AppNavigate;
  initialExpenseId?: string | null;
  onSave: (expense: Expense) => void;
  financialFxSnapshots?: readonly FinancialFxSnapshot[];
  baseCurrency?: string;
  onSaveFinancialFxSnapshot?: (input: FinancialFxSnapshotInput) => Promise<FinancialFxSnapshot | void>;
  onVerifySupplierInvoice?: (invoice: InvoiceData) => Promise<InvoiceData | void>;
  onFixSupplierInvoice?: (invoice: InvoiceData) => Promise<void> | void;
  onOpenSupplierInvoiceReview?: (invoice: InvoiceData) => void;
  onUploadSupplierInvoice?: () => void;
  settlementProjections?: ReadonlyMap<string, SupplierInvoiceSettlementProjection>;
  settlementMatches?: readonly SupplierInvoiceSettlementMatch[];
  supplierSettlementToday?: string;
  companyId?: string;
  onRefreshExpenses?: () => Promise<ExpensesWorkbookRecords>;
  onApplyExpenseWorkbook?: (expense: Expense) => Promise<void> | void;
  onPreviewCorrection: (expense: Expense) => Promise<FinancialCorrectionPreview>;
  onApplyCorrection: (expense: Expense, action: FinancialCorrectionAction, reason?: string) => Promise<FinancialCorrectionResult>;
  onInitialCorrectionConsumed?: () => void;
}

export const ExpensesRoute: React.FC<ExpensesRouteProps> = (props) => {
  const permissions = useAppPermissions();
  const canManage = hasPermission(permissions, PERMISSION_KEYS.expensesWrite);
  const canRecordPayments = hasAllPermissions(permissions, [PERMISSION_KEYS.cashSummaryRead, PERMISSION_KEYS.cashReconcile, PERMISSION_KEYS.expensesWrite]);

  return (
    <div className="space-y-5">
      <ExpensesPage {...props} canRecordPayments={canRecordPayments} canReversePayments={canRecordPayments} />
    </div>
  );
};

export default ExpensesRoute;

