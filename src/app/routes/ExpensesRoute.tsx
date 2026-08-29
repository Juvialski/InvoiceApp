import React from "react";
import { ExpensesPage } from "../../components/expenses/ExpensesPage";
import type { Expense, Project } from "../../types";
import type { FinancialCorrectionAction, FinancialCorrectionPreview, FinancialCorrectionResult } from "../../lib/financialLifecycle.ts";

export interface ExpensesRouteProps {
  expenses: Expense[];
  projects: Project[];
  initialProjectId?: string;
  initialExpenseId?: string | null;
  onSave: (expense: Expense) => void;
  onPreviewCorrection: (expense: Expense) => Promise<FinancialCorrectionPreview>;
  onApplyCorrection: (expense: Expense, action: FinancialCorrectionAction, reason?: string) => Promise<FinancialCorrectionResult>;
  onInitialCorrectionConsumed?: () => void;
}

export const ExpensesRoute: React.FC<ExpensesRouteProps> = (props) => {
  return <ExpensesPage {...props} />;
};

export default ExpensesRoute;
