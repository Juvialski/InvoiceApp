import React from "react";
import { ExpensesPage } from "../../components/expenses/ExpensesPage";
import type { Expense, Project } from "../../types";

export interface ExpensesRouteProps {
  expenses: Expense[];
  projects: Project[];
  initialProjectId?: string;
  onSave: (expense: Expense) => void;
  onArchive: (expense: Expense) => void;
}

export const ExpensesRoute: React.FC<ExpensesRouteProps> = (props) => {
  return <ExpensesPage {...props} />;
};

export default ExpensesRoute;
