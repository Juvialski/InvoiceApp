import React from "react";
import { ArrowLeft, WalletCards } from "lucide-react";
import { PayrollPageV2, type PayrollPageV2Props } from "../../components/payroll/PayrollPageV2";
import { PayrollRunView } from "../../components/payroll/PayrollRunView";
import { attendanceDateFromSearch, payrollPeriodIdFromSearch, payrollRunIdFromSearch } from "../../utils/appRouting.ts";
import { useWorkspaceDataPending } from "../AppPermissionContext.tsx";

export type PayrollRouteProps = PayrollPageV2Props;

function currentSearch() {
  return typeof window === "undefined" ? "" : window.location.search;
}

function safeReturnPath(search: string) {
  const value = new URLSearchParams(search.startsWith("?") ? search : `?${search}`).get("from")?.trim();
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/payroll";
}

export const PayrollRoute: React.FC<PayrollRouteProps> = (props) => {
  const workspaceDataPending = useWorkspaceDataPending();
  const periodPreparationState = props.periodPreparationState ?? (props.periods.length ? "READY" : workspaceDataPending ? "SYNCING" : props.schedules?.length ? "PREPARING" : "NO_SCHEDULE");
  const search = currentSearch();
  const requestedRunId = payrollRunIdFromSearch(search);
  const requestedPeriodId = payrollPeriodIdFromSearch(search);
  const requestedAttendanceDate = attendanceDateFromSearch(search);
  const requestedRun = requestedRunId ? props.runs.find((run) => run.id === requestedRunId) : undefined;
  const requestedPeriod = requestedRun
    ? props.periods.find((period) => period.id === requestedRun.periodId)
    : requestedPeriodId
      ? props.periods.find((period) => period.id === requestedPeriodId)
      : undefined;
  const requestedTargetMissing = Boolean(!workspaceDataPending && (
    (requestedRunId && !requestedRun)
    || (requestedPeriodId && !requestedPeriod)
    || (requestedRun && !requestedPeriod)
  ));

  if (requestedTargetMissing) {
    return (
      <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
        <p className="font-black">Payroll destination unavailable</p>
        <p className="mt-1 text-xs leading-5">The requested payroll run or period is not available in this workspace. No payroll data was changed.</p>
        <a href="/payroll" onClick={(event) => { if (!props.onNavigatePath) return; event.preventDefault(); props.onNavigatePath("/payroll"); }} className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm">Return to Payroll</a>
      </section>
    );
  }

  if (!requestedRun || !requestedPeriod) {
    return (
      <PayrollPageV2
        {...props}
        periodPreparationState={periodPreparationState}
        selectedPeriodId={!requestedRun ? requestedPeriod?.id : undefined}
        attendanceDate={requestedAttendanceDate}
      />
    );
  }

  return (
    <div className="space-y-5" data-tour="payroll-run-deep-link">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Payroll run</p>
            <h1 className="mt-1 text-xl font-black text-slate-950">{requestedPeriod.periodStart} – {requestedPeriod.periodEnd}</h1>
            <p className="mt-1 text-xs text-slate-500">Opened from a direct Engoryx link. Settlement evidence remains separate from payroll calculation and project labor cost.</p>
          </div>
          <a href={safeReturnPath(search)} onClick={(event) => { if (!props.onNavigatePath) return; event.preventDefault(); props.onNavigatePath(safeReturnPath(search)); }} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </a>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-500">
          <span className="rounded-full bg-slate-100 px-2.5 py-1">Payroll run</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700"><WalletCards className="h-3 w-3" /> {requestedRun.status}</span>
        </div>
      </section>
      <PayrollRunView
        runs={[requestedRun]}
        periods={props.periods}
        entries={props.entries}
        allocations={props.allocations}
        workers={props.workers}
        projects={props.projects}
        costCodes={props.costCodes}
        workEntries={props.workEntries || []}
        assignments={props.assignments}
        selectedPeriodId={requestedPeriod.id}
        onSaveEntry={props.onSavePayrollEntry}
        onUpdateRun={props.onUpdateRun}
        onCalculateRun={props.onCalculateRun}
      />
    </div>
  );
};

export default PayrollRoute;
