import React, { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, HardHat, Users, WalletCards } from "lucide-react";
import { PayrollEntry, PayrollPeriod, PayrollProjectAllocation, PayrollRun, Project, ProjectWorkerAssignment, Worker, WorkEntry } from "../../types";
import { PayrollPeriods } from "./PayrollPeriods";
import { PayrollRunView } from "./PayrollRunView";
import { WorkersTable } from "./WorkersTable";
import { TimeEntries } from "./TimeEntries";
import { ProjectAssignments } from "./ProjectAssignments";
import { PayrollImportWorkflow } from "./PayrollImportWorkflow";
import type { PayrollImportBatch, PayrollImportRow, PayrollImportTemplate } from "../../lib/payrollImportPersistence";
import type { StagedPayrollImport } from "../../lib/payrollImportWorkflow";

export interface PayrollPageProps {
  workers: Worker[];
  assignments: ProjectWorkerAssignment[];
  periods: PayrollPeriod[];
  runs: PayrollRun[];
  entries: PayrollEntry[];
  importBatches?: PayrollImportBatch[];
  allocations: PayrollProjectAllocation[];
  workEntries?: WorkEntry[];
  projects: Project[];
  onSaveWorker: (worker: Worker) => void;
  onSavePeriod: (period: PayrollPeriod) => void;
  onSaveAssignment?: (assignment: ProjectWorkerAssignment) => void;
  onSaveWorkEntry?: (entry: WorkEntry) => void;
  onSavePayrollEntry?: (entry: PayrollEntry, allocations: PayrollProjectAllocation[]) => void;
  onUpdateRun?: (run: PayrollRun) => void;
  /** The lead should use the selected period when creating the persisted run. */
  importTemplates?: PayrollImportTemplate[];
  onStagePayrollImport?: (batch: PayrollImportBatch, rows: PayrollImportRow[], bytes: Uint8Array) => void;
  onSavePayrollImportTemplate?: (template: PayrollImportTemplate) => void;
  onCommitPayrollImport?: (staged: StagedPayrollImport, periodStart: string, periodEnd: string, payDate?: string) => void;
  onCreateRun?: (periodId: string) => void;
  /** Lead-owned calculation/persistence bridge. */
  onCalculateRun?: (run: PayrollRun) => void;
}

type PayrollTab = "workers" | "time" | "runs" | "import";

export const PayrollPage: React.FC<PayrollPageProps> = ({ workers, assignments, periods, runs, entries, allocations, workEntries = [], projects, importBatches = [], importTemplates = [], onSaveWorker, onSavePeriod, onSaveAssignment, onSaveWorkEntry, onSavePayrollEntry, onUpdateRun, onCreateRun, onCalculateRun, onStagePayrollImport, onSavePayrollImportTemplate, onCommitPayrollImport }) => {
  const [tab, setTab] = useState<PayrollTab>("workers");
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId);
  const selectedPeriodRuns = selectedPeriod ? runs.filter((run) => run.periodId === selectedPeriod.id) : [];
  const selectedPeriodEntries = selectedPeriodRuns.flatMap((run) => entries.filter((entry) => entry.payrollRunId === run.id));
  const selectedPeriodAllocations = selectedPeriodEntries.flatMap((entry) => allocations.filter((allocation) => allocation.payrollEntryId === entry.id));
  const assignedProjects = useMemo(() => new Set(assignments.map((assignment) => assignment.projectId)).size, [assignments]);
  const gross = selectedPeriod ? selectedPeriodEntries.reduce((sum, entry) => sum + entry.grossPay, 0) : 0;
  const allocated = selectedPeriod ? selectedPeriodAllocations.reduce((sum, allocation) => sum + allocation.allocationAmount, 0) : 0;
  const selectedPeriodWorkEntries = selectedPeriod ? workEntries.filter((entry) => entry.periodId === selectedPeriod.id) : [];
  const periodHasLockedRun = selectedPeriodRuns.some((run) => run.status === "APPROVED" || run.status === "PAID" || run.status === "VOID");
  const selectablePeriods = periods.filter((period) => period.status !== "VOID");

  const selectPeriod = (periodId: string) => {
    setSelectedPeriodId(periodId);
    if (periodId) setTab("runs");
  };

  return <div className="space-y-5">
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Project labor operations</p><h2 className="text-xl font-black sm:text-2xl">Payroll</h2><p className="mt-1 text-xs text-slate-500">Manual project labor costing foundation — not a legally complete Philippine payroll engine.</p></div>
      <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
        <label className="min-w-0 flex-1 sm:min-w-[260px]"><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Working payroll period</span><span className="relative block"><select value={selectedPeriodId} onChange={(event) => selectPeriod(event.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-9 text-xs font-bold text-slate-800"><option value="">Select a period…</option>{selectablePeriods.map((period) => <option key={period.id} value={period.id}>{period.periodStart} – {period.periodEnd} · {period.status}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /></span></label>
        <button onClick={() => selectedPeriodId && onCreateRun?.(selectedPeriodId)} disabled={!selectedPeriodId || !onCreateRun} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><HardHat className="h-3.5 w-3.5" /> Create run</button>
      </div>
    </div>
    {!selectedPeriod && <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-black">Select a payroll period to begin.</p><p className="mt-1 text-amber-800">Payroll totals, time entries, and lifecycle actions stay scoped to the period you choose.</p></div></div>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Metric icon={<Users className="h-4 w-4 text-indigo-600" />} value={workers.filter((worker) => worker.active).length} label="Active workers" /><Metric icon={<CalendarDays className="h-4 w-4 text-indigo-600" />} value={selectedPeriod ? `${selectedPeriod.periodStart} – ${selectedPeriod.periodEnd}` : "—"} label="Selected period" small /><Metric icon={<WalletCards className="h-4 w-4 text-violet-600" />} value={money(gross)} label="Period gross" /><Metric icon={<WalletCards className="h-4 w-4 text-emerald-600" />} value={money(allocated)} label="Allocated labor" /><Metric icon={<Users className="h-4 w-4 text-amber-600" />} value={assignedProjects} label="Projects with labor" /></div>
    <nav className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">{([["workers", "Workers"], ["time", `Time entries${selectedPeriodWorkEntries.length ? ` (${selectedPeriodWorkEntries.length})` : ""}`], ["runs", `Payroll runs${selectedPeriodRuns.length ? ` (${selectedPeriodRuns.length})` : ""}`], ["import", "Import workbook"]] as Array<[PayrollTab, string]>).map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`rounded-lg px-3 py-2 text-xs font-bold ${tab === value ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}</nav>
    {tab === "workers" && <div className="space-y-4"><WorkersTable workers={workers} onSave={onSaveWorker} />{onSaveAssignment && <ProjectAssignments assignments={assignments} workers={workers} projects={projects} onSave={onSaveAssignment} />}<PayrollPeriods periods={periods} onSave={onSavePeriod} /></div>}
    {tab === "import" && onStagePayrollImport && onSavePayrollImportTemplate && onCommitPayrollImport && <PayrollImportWorkflow workers={workers} projects={projects} batches={importBatches} templates={importTemplates} onStage={onStagePayrollImport} onSaveTemplate={onSavePayrollImportTemplate} onCommit={onCommitPayrollImport} />}
    {tab === "time" && (onSaveWorkEntry ? <TimeEntries entries={workEntries} workers={workers} projects={projects} periods={periods} assignments={assignments} runs={runs} selectedPeriodId={selectedPeriodId} onSave={onSaveWorkEntry} /> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">Time entry persistence is not available in this workspace.</div>)}
    {tab === "runs" && <PayrollRunView runs={runs} periods={periods} entries={entries} allocations={allocations} workers={workers} projects={projects} workEntries={workEntries} assignments={assignments} selectedPeriodId={selectedPeriodId} onSaveEntry={onSavePayrollEntry} onUpdateRun={onUpdateRun} onCreateRun={onCreateRun} onCalculateRun={onCalculateRun} />}
    {periodHasLockedRun && <p className="text-[10px] text-slate-500">This period contains a locked run. Approved, paid, or void run data is read-only.</p>}
  </div>;
};

function money(value: number) { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value || 0); }
function Metric({ icon, value, label, small = false }: { icon: React.ReactNode; value: React.ReactNode; label: string; small?: boolean }) { return <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div>{icon}</div><p className={`${small ? "text-xs" : "text-xl"} mt-3 truncate font-black tabular-nums`}>{value}</p><p className="text-[10px] font-semibold text-slate-500">{label}</p></div>; }
