import React, { useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { PayrollEntry, PayrollProjectAllocation, PayrollRun, Project, ProjectCostCode, Worker } from "../../types";
import { calculateMonthlyProjectAllocations } from "../../lib/payroll";
import { validatePayrollProjectAllocations } from "../../lib/payrollCalculation";
import { formatCostCodeOptionLabel, getSelectableCostCodes } from "../../lib/projectCostCodes";

interface PayrollEntryFormProps {
  runs: PayrollRun[];
  workers: Worker[];
  projects: Project[];
  costCodes?: ProjectCostCode[];
  onSave: (entry: PayrollEntry, allocations: PayrollProjectAllocation[]) => void;
}
interface AllocationDraft {
  id: string;
  projectId: string;
  projectCostCodeId?: string;
  percentage: number;
}
function localId() { return globalThis.crypto?.randomUUID?.() || `local-payroll-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function money(value: number) { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value || 0); }

export const PayrollEntryForm: React.FC<PayrollEntryFormProps> = ({ runs, workers, projects, costCodes = [], onSave }) => {
  const [open, setOpen] = useState(false);
  const [runId, setRunId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [grossPay, setGrossPay] = useState(0);
  const [deductions, setDeductions] = useState(0);
  const [allocations, setAllocations] = useState<AllocationDraft[]>([]);
  const [message, setMessage] = useState("");
  const editableRuns = runs.filter((run) => run.status === "DRAFT" || run.status === "CALCULATED");
  const run = runs.find((item) => item.id === runId);
  const allocationPreview = useMemo(() => validatePayrollProjectAllocations(grossPay, allocations.map((allocation) => ({ projectId: allocation.projectId, allocationAmount: grossPay * Math.max(0, allocation.percentage) / 100, allocationPercentage: allocation.percentage }))), [grossPay, allocations]);

  const start = () => {
    const firstProject = projects.find((project) => project.status !== "ARCHIVED");
    setRunId(editableRuns[0]?.id || "");
    setWorkerId(workers[0]?.id || "");
    setGrossPay(workers[0]?.defaultRate || 0);
    setDeductions(0);
    setMessage("");
    setAllocations([{ id: localId(), projectId: firstProject?.id || "", projectCostCodeId: undefined, percentage: 100 }]);
    setOpen(true);
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!run || !workerId || !Number.isFinite(grossPay) || grossPay < 0 || !allocations.length || allocations.some((allocation) => !allocation.projectId)) { setMessage("Choose a worker, run, and project for every allocation."); return; }
    if (allocationPreview.issues.length) { setMessage(allocationPreview.issues.map((issue) => issue.message).join(" ")); return; }
    const calculated = calculateMonthlyProjectAllocations(grossPay, allocations.map(({ projectId, percentage }) => ({ projectId, percentage })));
    const entry: PayrollEntry = { id: localId(), payrollRunId: run.id, workerId, basePay: grossPay, regularPay: grossPay, overtimePay: 0, allowances: 0, grossPay, deductions, netPay: Math.max(0, grossPay - deductions), projectAllocatedCost: calculated.reduce((sum, allocation) => sum + allocation.allocationAmount, 0), calculationSnapshot: { method: "MANUAL_PROJECT_PERCENTAGE", allocations: calculated, allocationCompleteness: allocationPreview }, createdAt: new Date().toISOString() };
    const allocationRows: PayrollProjectAllocation[] = calculated.map((allocation, index) => ({
      id: localId(),
      payrollEntryId: entry.id,
      projectId: allocation.projectId,
      projectCostCodeId: allocations[index]?.projectCostCodeId || undefined,
      allocationAmount: allocation.allocationAmount,
      allocationPercentage: allocation.allocationPercentage,
      source: "MANUAL",
    }));
    onSave(entry, allocationRows);
    setOpen(false);
  };

  return <><button onClick={start} disabled={!editableRuns.length || !workers.length || !projects.length} className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="mr-1 inline h-3.5 w-3.5" /> Add payroll entry</button>{open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><form onSubmit={save} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h3 className="text-lg font-black">Add payroll entry</h3><p className="mt-1 text-xs text-slate-500">Entries and allocations can be changed only before approval.</p></div><button type="button" onClick={() => setOpen(false)} className="text-xl text-slate-400">×</button></div><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Payroll run</span><select required value={runId} onChange={(event) => setRunId(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs">{editableRuns.map((item) => <option key={item.id} value={item.id}>{item.status} · {item.id.slice(0, 8)}</option>)}</select></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Worker</span><select required value={workerId} onChange={(event) => setWorkerId(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs">{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.displayName} · {worker.employeeCode}</option>)}</select></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Gross pay</span><input required type="number" min="0" step="0.01" value={grossPay} onChange={(event) => setGrossPay(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Deductions</span><input type="number" min="0" step="0.01" value={deductions} onChange={(event) => setDeductions(Number(event.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-black uppercase text-slate-500">Project allocation percentages</p><button type="button" onClick={() => setAllocations((current) => [...current, { id: localId(), projectId: "", projectCostCodeId: undefined, percentage: 0 }])} className="text-[10px] font-bold text-indigo-700"><Plus className="mr-1 inline h-3 w-3" /> Add project</button></div><div className="space-y-2">{allocations.map((allocation) => { const selectableCodes = getSelectableCostCodes(costCodes, allocation.projectId, allocation.projectCostCodeId); return <div key={allocation.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2.5 sm:flex-row sm:items-center"><div className="grid flex-1 gap-2 sm:grid-cols-2"><select required aria-label="Allocation project" value={allocation.projectId} onChange={(event) => { const nextProjectId = event.target.value; const currentCode = costCodes.find((cc) => cc.id === allocation.projectCostCodeId); const nextCostCodeId = currentCode && currentCode.projectId === nextProjectId ? allocation.projectCostCodeId : undefined; setAllocations((current) => current.map((item) => item.id === allocation.id ? { ...item, projectId: nextProjectId, projectCostCodeId: nextCostCodeId } : item)); }} className="min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]"><option value="">Select project</option>{projects.filter((project) => project.status !== "ARCHIVED" || project.id === allocation.projectId).map((project) => <option key={project.id} value={project.id}>{project.projectCode} — {project.projectName}{project.status === "ARCHIVED" ? " (archived)" : ""}</option>)}</select><select aria-label="Allocation cost code" disabled={!allocation.projectId} value={allocation.projectCostCodeId || ""} onChange={(event) => { const nextCostCodeId = event.target.value || undefined; setAllocations((current) => current.map((item) => item.id === allocation.id ? { ...item, projectCostCodeId: nextCostCodeId } : item)); }} className="min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]"><option value="">Uncoded</option>{selectableCodes.map((cc) => <option key={cc.id} value={cc.id}>{formatCostCodeOptionLabel(cc)}</option>)}</select></div><div className="flex items-center gap-1.5"><input aria-label="Allocation percentage" required type="number" min="0" max="100" step="0.01" value={allocation.percentage} onChange={(event) => setAllocations((current) => current.map((item) => item.id === allocation.id ? { ...item, percentage: Number(event.target.value) } : item))} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-[10px]" /><span className="text-[10px] text-slate-500">%</span>{allocations.length > 1 && <button type="button" onClick={() => setAllocations((current) => current.filter((item) => item.id !== allocation.id))} className="rounded-lg p-1.5 text-slate-400 hover:text-rose-700" aria-label="Remove project allocation"><Trash2 className="h-3.5 w-3.5" /></button>}</div></div>; })}</div><div className="mt-3 flex items-start gap-2 text-[10px]"><AlertTriangle className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${allocationPreview.unallocatedAmount > 0 ? "text-amber-600" : "text-emerald-600"}`} /><span className={allocationPreview.unallocatedAmount > 0 ? "text-amber-800" : "text-emerald-700"}>{allocationPreview.allocationPercentage.toFixed(2)}% allocated · {money(allocationPreview.unallocatedAmount)} unallocated labor. {allocationPreview.unallocatedAmount > 0 ? "It remains outside project labor cost until assigned." : "Allocation is complete."}</span></div></div>{message && <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800">{message}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button><button type="submit" disabled={!run} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Save payroll entry</button></div></form></div>}</>;
};

