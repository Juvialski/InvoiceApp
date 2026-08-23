import type { PayrollPeriod } from "../types";

export interface PayrollImportPeriodMatchInput {
  periodStart?: string;
  periodEnd?: string;
  periods: PayrollPeriod[];
  selectedPeriodId?: string;
}

export interface PayrollImportPeriodMatch {
  period?: PayrollPeriod;
  exact: boolean;
  conflict: boolean;
  message?: string;
}

/** Matches workbook metadata to generated periods without silently changing a user’s selection. */
export function matchPayrollImportPeriod(input: PayrollImportPeriodMatchInput): PayrollImportPeriodMatch {
  const start = input.periodStart?.slice(0, 10);
  const end = input.periodEnd?.slice(0, 10);
  const selected = input.periods.find((period) => period.id === input.selectedPeriodId);
  if (!start || !end) return { exact: false, conflict: false };
  const exact = input.periods.find((period) => period.periodStart === start && period.periodEnd === end && period.status !== "VOID");
  if (selected && (selected.periodStart !== start || selected.periodEnd !== end)) {
    return { period: exact, exact: Boolean(exact), conflict: true, message: `Workbook covers ${start} – ${end}, but the selected payroll period is ${selected.periodStart} – ${selected.periodEnd}.` };
  }
  if (exact) return { period: exact, exact: true, conflict: false, message: `Workbook period matched ${exact.periodStart} – ${exact.periodEnd}.` };
  return { exact: false, conflict: Boolean(selected), message: `No generated payroll period matches workbook dates ${start} – ${end}. Review the period before committing.` };
}
