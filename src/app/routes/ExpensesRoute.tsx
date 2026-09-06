import React from "react";
import { ExpensesPage } from "../../components/expenses/ExpensesPage";
import { ConnectedExpenseReview } from "../../components/ConnectedExpenseReview.tsx";
import type { Expense, InvoiceData, Project, ProjectCostCode, PurchaseOrder, Vendor } from "../../types";
import type { FinancialCorrectionAction, FinancialCorrectionPreview, FinancialCorrectionResult } from "../../lib/financialLifecycle.ts";
import { useAppPermissions } from "../AppPermissionContext.tsx";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";

export interface ExpensesRouteProps {
  expenses: Expense[];
  projects: Project[];
  invoices?: readonly InvoiceData[];
  purchaseOrders?: readonly PurchaseOrder[];
  vendors?: readonly Vendor[];
  costCodes?: ProjectCostCode[];
  initialProjectId?: string;
  initialExpenseId?: string | null;
  onSave: (expense: Expense) => void;
  onPreviewCorrection: (expense: Expense) => Promise<FinancialCorrectionPreview>;
  onApplyCorrection: (expense: Expense, action: FinancialCorrectionAction, reason?: string) => Promise<FinancialCorrectionResult>;
  onInitialCorrectionConsumed?: () => void;
}

export const ExpensesRoute: React.FC<ExpensesRouteProps> = (props) => {
  const permissions = useAppPermissions();
  const canManage = hasPermission(permissions, PERMISSION_KEYS.expensesWrite);

  return (
    <div className="space-y-5">
      <ConnectedExpenseReview
        projects={props.projects}
        existingExpenses={props.expenses}
        canManage={canManage}
        onSaveExpense={props.onSave}
      />
      <ExpensesPage {...props} />
    </div>
  );
};

export default ExpensesRoute;

