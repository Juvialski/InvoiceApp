import React, { useMemo } from "react";
import { AlertTriangle, Building2, HardHat, WalletCards } from "lucide-react";
import type { PayrollEntry, PayrollProjectAllocation, PayrollRun } from "../../types";
import { buildPayrollOperatingCostSummary } from "../../utils/projectReports";

interface PayrollOperatingCostsProps {
  runs: PayrollRun[];
  entries: PayrollEntry[];
  allocations: PayrollProjectAllocation[];
}

export const PayrollOperatingCosts: React.FC<PayrollOperatingCostsProps> = ({ runs, entries, allocations }) => {
  const summary = useMemo(() => buildPayrollOperatingCostSummary(runs, entries, allocations), [runs, entries, allocations]);
  const cards: Array<[string, number, React.ElementType, string]> = [
    ["Company payroll", summary.totalGross, WalletCards, "text-indigo-700 bg-indigo-50"],
    ["Confirmed payroll", summary.confirmedGross, HardHat, "text-emerald-700 bg-emerald-50"],
    ["Project labor", summary.projectLabor, Building2, "text-violet-700 bg-violet-50"],
    ["Admin / overhead", summary.overheadLabor, WalletCards, "text-amber-700 bg-amber-50"],
    ["Unallocated / review", summary.unallocatedLabor, AlertTriangle, "text-rose-700 bg-rose-50"],
  ];
  return <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Company labor reporting</p><h3 className="mt-1 text-sm font-black">Payroll operating-cost summary</h3><p className="mt-1 text-xs text-slate-500">Admin/office payroll stays in company operating costs and does not inflate project actual cost.</p></div><div className="grid grid-cols-2 gap-3 md:grid-cols-5">{cards.map(([label, value, Icon, tone]) => <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}><Icon className="h-3.5 w-3.5" /></div><p className="mt-2 text-sm font-black tabular-nums">₱{value.toFixed(2)}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">{label}</p></div>)}</div></section>;
};
