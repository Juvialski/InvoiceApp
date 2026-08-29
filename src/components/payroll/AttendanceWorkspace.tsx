import React, { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Plus, RotateCcw, Save, ShieldAlert } from "lucide-react";
import type { AttendanceRecord, AttendanceStatus, LeaveRequest, OvertimeRequest, PayrollHoliday, PayrollPeriod, Worker } from "../../types";
import { buildDailyRoster, markScheduledWorkersPresent, normalizeAttendanceRecord } from "../../lib/payrollWorkforce";
import { commitAttendanceImportPreview, parseAttendanceWorkbook, type AttendanceImportPreview } from "../../lib/attendanceImport";
import type { WorkforceWorker } from "../../lib/payrollWorkforce";
import type { PayrollLifecycleRequest } from "../../lib/payrollLifecycle";

interface AttendanceWorkspaceProps {
  workers: Worker[];
  periods: PayrollPeriod[];
  selectedPeriodId: string;
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  overtimeRequests: OvertimeRequest[];
  holidays: PayrollHoliday[];
  lockedPeriodIds?: readonly string[];
  onSaveAttendance: (record: AttendanceRecord) => void;
  onSaveAttendanceBatch?: (records: AttendanceRecord[]) => void;
  onSaveLeave?: (request: LeaveRequest) => void;
  onSaveOvertime?: (request: OvertimeRequest) => void;
  onSaveHoliday?: (holiday: PayrollHoliday) => void;
  onPayrollLifecycle?: (request: PayrollLifecycleRequest) => Promise<void> | void;
  canManagePayrollSources?: boolean;
}

type DraftRow = { status: AttendanceStatus; timeIn: string; timeOut: string; notes: string };
const ATTENDANCE_STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "PARTIAL", "ON_LEAVE", "REST_DAY", "HOLIDAY", "OFFICIAL_BUSINESS"];

function localDateOnly() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function id(prefix: string) { return globalThis.crypto?.randomUUID?.() || `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function now() { return new Date().toISOString(); }
function moneyHours(minutes: number) { return (Math.max(0, minutes) / 60).toFixed(2); }
function label(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/(^| )\w/g, (match) => match.toUpperCase()); }
function workersForRoster(workers: Worker[]): WorkforceWorker[] {
  return workers.map((worker) => ({
    id: worker.id,
    active: worker.active,
    employmentStatus: worker.employmentStatus,
    hireDate: worker.hireDate,
    endDate: worker.endDate,
    workingDays: worker.workingDays,
    workingHoursStart: worker.workingHoursStart,
    workingHoursEnd: worker.workingHoursEnd,
    employeeCode: worker.employeeCode,
    displayName: worker.displayName,
  }));
}

export const AttendanceWorkspace: React.FC<AttendanceWorkspaceProps> = ({
  workers, periods, selectedPeriodId, attendanceRecords, leaveRequests, overtimeRequests, holidays, lockedPeriodIds = [],
  onSaveAttendance, onSaveAttendanceBatch, onSaveLeave, onSaveOvertime, onSaveHoliday, onPayrollLifecycle, canManagePayrollSources = true,
}) => {
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId);
  const [date, setDate] = useState(() => selectedPeriod?.periodStart || localDateOnly());
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [leaveForm, setLeaveForm] = useState({ workerId: workers[0]?.id || "", leaveType: "PERSONAL", startDate: date, endDate: date, paid: "" });
  const [overtimeForm, setOvertimeForm] = useState({ workerId: workers[0]?.id || "", date, hours: "1", reason: "" });
  const [holidayForm, setHolidayForm] = useState({ date, name: "" });
  const [importPreview, setImportPreview] = useState<AttendanceImportPreview | null>(null);

  const recordsForDate = useMemo(
    () => attendanceRecords.filter((record) => record.attendanceDate === date && record.recordStatus !== "VOID"),
    [attendanceRecords, date],
  );
  const recordByWorker = useMemo(() => new Map(recordsForDate.map((record) => [record.workerId, record])), [recordsForDate]);
  const roster = useMemo(() => buildDailyRoster({ date, workers: workersForRoster(workers), leaveRequests, holidays }), [date, workers, leaveRequests, holidays]);
  const snapshots = roster.snapshots;
  const approvedOtMinutes = useMemo(
    () => overtimeRequests.filter((request) => request.overtimeDate === date && request.status === "APPROVED").reduce((sum, request) => sum + request.approvedMinutes, 0),
    [overtimeRequests, date],
  );
  const expectedCount = snapshots.filter((snapshot) => snapshot.expected).length;
  const presentCount = recordsForDate.filter((record) => record.attendanceStatus === "PRESENT" || record.attendanceStatus === "OFFICIAL_BUSINESS").length;
  const absentCount = recordsForDate.filter((record) => record.attendanceStatus === "ABSENT").length;
  const leaveCount = snapshots.filter((snapshot) => snapshot.status === "ON_LEAVE").length + recordsForDate.filter((record) => record.attendanceStatus === "ON_LEAVE").length;
  const missingCount = snapshots.filter((snapshot) => snapshot.expected && !recordByWorker.has(snapshot.workerId)).length;

  const periodDatesValid = !selectedPeriod || (date >= selectedPeriod.periodStart && date <= selectedPeriod.periodEnd);
  const selectedPeriodLocked = Boolean(selectedPeriod && (lockedPeriodIds.includes(selectedPeriod.id) || ["APPROVED", "PAID", "VOID"].includes(selectedPeriod.status)));
  const draftFor = (workerId: string, record: AttendanceRecord | undefined, snapshot: (typeof snapshots)[number]): DraftRow => {
    const savedStatus = record?.attendanceStatus || (snapshot.status === "ON_LEAVE" ? "ON_LEAVE" : snapshot.status === "HOLIDAY" ? "HOLIDAY" : snapshot.status === "REST_DAY" ? "REST_DAY" : "PRESENT");
    return drafts[workerId] || { status: savedStatus, timeIn: record?.actualTimeIn || "", timeOut: record?.actualTimeOut || "", notes: record?.notes || "" };
  };

  const setDateAndReset = (next: string) => { setDate(next); setDrafts({}); setMessage(null); setOvertimeForm((current) => ({ ...current, date: next })); setHolidayForm((current) => ({ ...current, date: next })); };
  const changeDate = (days: number) => {
    const base = new Date(`${date}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + days);
    setDateAndReset(base.toISOString().slice(0, 10));
  };

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const preview = parseAttendanceWorkbook(new Uint8Array(await file.arrayBuffer()), {
        fileName: file.name,
        workers,
        periodStart: selectedPeriod?.periodStart,
        periodEnd: selectedPeriod?.periodEnd,
        existingRecords: attendanceRecords,
      });
      setImportPreview(preview);
      setMessage({ tone: preview.canCommit ? "info" : "error", text: preview.canCommit ? "Attendance import is ready for review and commit." : "Attendance import needs review before it can be committed." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not read the attendance workbook." });
    } finally {
      event.target.value = "";
    }
  };

  const commitImport = () => {
    if (!importPreview) return;
    try {
      const imported = commitAttendanceImportPreview(importPreview, { periodId: selectedPeriodId || undefined, existingRecords: attendanceRecords });
      if (onSaveAttendanceBatch) onSaveAttendanceBatch(imported);
      else imported.forEach(onSaveAttendance);
      setImportPreview(null);
      setMessage({ tone: "info", text: String(imported.length) + " imported attendance record" + (imported.length === 1 ? "" : "s") + " staged as DRAFT for confirmation." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not commit attendance import." });
    }
  };

  const saveRow = (snapshot: (typeof snapshots)[number]) => {
    const worker = workers.find((candidate) => candidate.id === snapshot.workerId);
    const current = recordByWorker.get(snapshot.workerId);
    const draft = draftFor(snapshot.workerId, current, snapshot);
    const normalized = normalizeAttendanceRecord({
      id: current?.id || id("attendance"),
      companyId: current?.companyId,
      workerId: snapshot.workerId,
      periodId: current?.periodId || selectedPeriodId || undefined,
      attendanceDate: date,
      scheduledStart: snapshot.scheduledStart,
      scheduledEnd: snapshot.scheduledEnd,
      scheduledMinutes: snapshot.scheduledMinutes,
      breakMinutes: current?.breakMinutes || 0,
      actualTimeIn: draft.timeIn || undefined,
      actualTimeOut: draft.timeOut || undefined,
      attendanceStatus: draft.status,
      recordStatus: "CONFIRMED",
      source: current?.source || "MANUAL",
      notes: draft.notes || undefined,
    }, { existing: current, defaultRecordStatus: "CONFIRMED", defaultSource: current?.source || "MANUAL" });
    if (!normalized.valid || !normalized.record) {
      setMessage({ tone: "error", text: normalized.errors.map((issue) => issue.message).join(" ") || "Attendance record is invalid." });
      return;
    }
    const saved: AttendanceRecord = {
      ...normalized.record,
      id: normalized.record.id || current?.id || id("attendance"),
      periodId: normalized.record.periodId || selectedPeriodId || undefined,
      createdAt: current?.createdAt || now(),
      updatedAt: now(),
    } as AttendanceRecord;
    onSaveAttendance(saved);
    setDrafts((currentDrafts) => { const next = { ...currentDrafts }; delete next[snapshot.workerId]; return next; });
    setMessage({ tone: "info", text: `${worker?.displayName || "Worker"} attendance saved.` });
  };

  const markPresent = () => {
    if (!canManagePayrollSources) return;
    if (!periodDatesValid) { setMessage({ tone: "error", text: "Choose a date inside the selected payroll period before applying the bulk action." }); return; }
    if (!window.confirm("Mark all scheduled workers present for this date? Rest-day, holiday, leave, inactive, and ended workers will be excluded.")) return;
    const result = markScheduledWorkersPresent({
      date,
      workers: workersForRoster(workers),
      leaveRequests,
      holidays,
      existingRecords: attendanceRecords,
      source: "BULK",
      recordStatus: "CONFIRMED",
    });
    if (!result.valid) { setMessage({ tone: "error", text: result.errors.map((issue) => issue.message).join(" ") }); return; }
    const changed = [...result.created, ...result.updated].map((record) => ({ ...record, periodId: record.periodId || selectedPeriodId || undefined, id: record.id || id("attendance"), createdAt: record.createdAt || now(), updatedAt: now() } as AttendanceRecord));
    if (changed.length) onSaveAttendanceBatch ? onSaveAttendanceBatch(changed) : changed.forEach(onSaveAttendance);
    setMessage({ tone: "info", text: `Marked ${changed.length} scheduled worker${changed.length === 1 ? "" : "s"} present. ${result.excluded.length} worker${result.excluded.length === 1 ? "" : "s"} were excluded by schedule context.` });
  };

  const saveLeave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!onSaveLeave || !leaveForm.workerId || !leaveForm.leaveType || !leaveForm.startDate || !leaveForm.endDate) return;
    onSaveLeave({ id: id("leave"), workerId: leaveForm.workerId, leaveType: leaveForm.leaveType, startDate: leaveForm.startDate, endDate: leaveForm.endDate, paid: leaveForm.paid === "" ? undefined : leaveForm.paid === "true", status: "PENDING", notes: "", createdAt: now(), updatedAt: now() });
    setMessage({ tone: "info", text: "Leave request saved as pending review." });
  };
  const saveOvertime = (event: React.FormEvent) => {
    event.preventDefault();
    if (!onSaveOvertime || !overtimeForm.workerId || !overtimeForm.date) return;
    const minutes = Math.max(0, Math.round(Number(overtimeForm.hours || 0) * 60));
    onSaveOvertime({ id: id("overtime"), workerId: overtimeForm.workerId, periodId: selectedPeriodId || undefined, overtimeDate: overtimeForm.date, laborContext: "UNALLOCATED_REVIEW", requestedMinutes: minutes, approvedMinutes: 0, status: "PENDING", source: "MANUAL", reason: overtimeForm.reason || undefined, createdAt: now(), updatedAt: now() });
    setMessage({ tone: "info", text: "Overtime request saved as pending approval." });
  };
  const saveHoliday = (event: React.FormEvent) => {
    event.preventDefault();
    if (!onSaveHoliday || !holidayForm.date || !holidayForm.name.trim()) return;
    onSaveHoliday({ id: id("holiday"), holidayDate: holidayForm.date, name: holidayForm.name.trim(), active: true, createdAt: now(), updatedAt: now() });
    setHolidayForm((current) => ({ ...current, name: "" }));
    setMessage({ tone: "info", text: "Company holiday saved." });
  };
  const updateLeaveStatus = (request: LeaveRequest, status: LeaveRequest["status"]) => {
    if (status === "CANCELLED") {
      if (!onPayrollLifecycle || !canManagePayrollSources) return;
      if (!window.confirm("Cancel this leave request?\n\nThe request will remain in history and will no longer affect future payroll calculation.")) return;
      void Promise.resolve(onPayrollLifecycle({ entity: "LEAVE", id: request.id, action: "CANCEL", reason: "Leave request cancelled by an authorized payroll user" })).catch((error) => setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not cancel leave." }));
      return;
    }
    if (!onSaveLeave) return;
    onSaveLeave({ ...request, status, updatedAt: now() });
  };

  const runSourceLifecycle = (entity: "ATTENDANCE" | "OVERTIME", recordId: string, action: "VOID" | "CANCEL" | "DELETE_DRAFT") => {
    if (!onPayrollLifecycle || !canManagePayrollSources) return;
    const noun = entity === "ATTENDANCE" ? "attendance" : "overtime request";
    if (!window.confirm(action === "DELETE_DRAFT" ? `Delete this unused draft ${noun}?\n\nThis action cannot be undone.` : `${action === "VOID" ? "Void" : "Cancel"} this ${noun}?\n\nThe source will remain in history and will not be silently removed.`)) return;
    void Promise.resolve(onPayrollLifecycle({ entity, id: recordId, action, reason: action === "DELETE_DRAFT" ? `Confirmed unused draft ${noun} deletion` : `${noun} corrected by an authorized payroll user` })).catch((error) => setMessage({ tone: "error", text: error instanceof Error ? error.message : `Could not change ${noun}.` }));
  };

  return <section className="space-y-4" data-tour="attendance-roster">
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Daily workforce operations</p><h3 className="mt-1 text-lg font-black">Attendance</h3><p className="mt-1 text-xs text-slate-500">Attendance records presence and payable time. Time / Labor remains the project and overhead allocation source.</p></div>
        <div className="flex flex-wrap items-end gap-2"><label className="space-y-1"><span className="field-label">Attendance date</span><input type="date" value={date} min={selectedPeriod?.periodStart} max={selectedPeriod?.periodEnd} onChange={(event) => setDateAndReset(event.target.value)} className="field-input" /></label><button type="button" onClick={() => setDateAndReset(localDateOnly())} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">Today</button><button type="button" onClick={() => changeDate(-1)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">Previous</button><button type="button" onClick={() => changeDate(1)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">Next</button></div>
      </div>
      {!periodDatesValid && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />This date is outside the selected payroll period. Choose a period date before saving.</div>}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">{[
        ["Expected", expectedCount], ["Present", presentCount], ["Absent", absentCount], ["Missing", missingCount], ["Leave", leaveCount], ["Late", recordsForDate.filter((record) => record.lateMinutes > 0).length], ["OT hours", moneyHours(approvedOtMinutes)], ["Roster", snapshots.length],
      ].map(([name, value]) => <div key={String(name)} className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-semibold text-slate-500">{name}</p><p className="mt-1 text-lg font-black tabular-nums">{value}</p></div>)}</div>
      {message && <div className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs ${message.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-indigo-100 bg-indigo-50 text-indigo-900"}`}><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{message.text}</div>}
      <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" onClick={markPresent} disabled={!periodDatesValid || !workers.length || !canManagePayrollSources} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="h-3.5 w-3.5" /> Mark scheduled workers present</button><span className="text-[10px] text-slate-500">Exceptions can be edited below before payroll calculation.</span></div>
    </div>

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4"><h4 className="text-sm font-black">Daily roster · {date}</h4><p className="mt-1 text-xs text-slate-500">One attendance record per worker/day. Schedule values are snapshots and do not change when the worker schedule changes later.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3">Worker</th><th className="px-4 py-3">Schedule</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Time in</th><th className="px-4 py-3">Time out</th><th className="px-4 py-3">Derived</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{snapshots.map((snapshot) => {
        const worker = workers.find((candidate) => candidate.id === snapshot.workerId);
        const record = recordByWorker.get(snapshot.workerId);
        const current = record;
        const draft = draftFor(snapshot.workerId, record, snapshot);
        const effective = record ? record : undefined;
        const lockedHint = snapshot.status !== "SCHEDULED" ? label(snapshot.status) : "Scheduled";
        return <tr key={snapshot.workerId} className={!snapshot.expected ? "bg-slate-50/50" : undefined}><td className="px-4 py-3"><p className="font-bold">{worker?.displayName || snapshot.workerId}</p><p className="text-[10px] text-slate-500">{worker?.employeeCode || "—"} · {lockedHint}</p></td><td className="px-4 py-3 text-slate-600">{snapshot.scheduledStart && snapshot.scheduledEnd ? `${snapshot.scheduledStart}–${snapshot.scheduledEnd}` : "No clock schedule"}<p className="text-[10px] text-slate-400">{snapshot.scheduledMinutes ? `${snapshot.scheduledMinutes} min` : "Schedule snapshot pending"}</p></td><td className="px-4 py-3"><select disabled={!canManagePayrollSources} value={draft.status} onChange={(event) => setDrafts((current) => ({ ...current, [snapshot.workerId]: { ...draft, status: event.target.value as AttendanceStatus } }))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-bold">{ATTENDANCE_STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></td><td className="px-4 py-3"><input disabled={!canManagePayrollSources} type="time" value={draft.timeIn} onChange={(event) => setDrafts((current) => ({ ...current, [snapshot.workerId]: { ...draft, timeIn: event.target.value } }))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]" /></td><td className="px-4 py-3"><input disabled={!canManagePayrollSources} type="time" value={draft.timeOut} onChange={(event) => setDrafts((current) => ({ ...current, [snapshot.workerId]: { ...draft, timeOut: event.target.value } }))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]" /></td><td className="px-4 py-3 text-[10px] text-slate-600">{effective ? `${effective.regularMinutes}m regular · ${effective.lateMinutes}m late · ${effective.undertimeMinutes}m under` : "Missing attendance"}</td><td className="px-4 py-3 text-right"><div className="flex flex-wrap justify-end gap-1.5">{canManagePayrollSources && <button type="button" onClick={() => saveRow(snapshot)} disabled={!periodDatesValid} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-800 disabled:opacity-40"><Save className="h-3 w-3" /> Save</button>}{canManagePayrollSources && record && record.recordStatus === "DRAFT" && <button type="button" onClick={() => runSourceLifecycle("ATTENDANCE", record.id, "DELETE_DRAFT")} className="text-[10px] font-bold text-rose-700">Delete draft</button>}{canManagePayrollSources && record && record.recordStatus === "CONFIRMED" && !selectedPeriodLocked && <button type="button" onClick={() => runSourceLifecycle("ATTENDANCE", record.id, "VOID")} className="text-[10px] font-bold text-amber-700">Void</button>}</div></td></tr>;
      })}</tbody></table></div>
      {!snapshots.length && <div className="p-10 text-center text-xs text-slate-500"><Clock3 className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 font-bold">No workforce records are eligible for this date.</p></div>}
    </div>

    <div className="grid gap-4 xl:grid-cols-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><h4 className="text-sm font-black">Leave / absences</h4><p className="mt-1 text-[10px] text-slate-500">Approve, reject, or cancel leave here. Approved leave appears in the roster automatically; pay treatment is never assumed.</p></div><CalendarDays className="h-4 w-4 text-indigo-600" /></div>{onSaveLeave && <form onSubmit={saveLeave} className="mt-3 space-y-2"><select value={leaveForm.workerId} onChange={(event) => setLeaveForm({ ...leaveForm, workerId: event.target.value })} className="field-input">{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.displayName}</option>)}</select><div className="grid grid-cols-2 gap-2"><input type="date" value={leaveForm.startDate} onChange={(event) => setLeaveForm({ ...leaveForm, startDate: event.target.value })} className="field-input" /><input type="date" value={leaveForm.endDate} onChange={(event) => setLeaveForm({ ...leaveForm, endDate: event.target.value })} className="field-input" /></div><div className="grid grid-cols-2 gap-2"><input value={leaveForm.leaveType} onChange={(event) => setLeaveForm({ ...leaveForm, leaveType: event.target.value })} placeholder="Leave type" className="field-input" /><select value={leaveForm.paid} onChange={(event) => setLeaveForm({ ...leaveForm, paid: event.target.value })} className="field-input"><option value="">Pay treatment not configured</option><option value="true">Explicitly paid</option><option value="false">Explicitly unpaid</option></select></div><button className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> Record leave request</button></form>}{leaveRequests.filter((request) => ["PENDING", "APPROVED"].includes(request.status)).slice(0, 6).map((request) => <div key={request.id} className="mt-3 rounded-xl bg-slate-50 p-3 text-[10px]"><div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate font-bold">{workers.find((worker) => worker.id === request.workerId)?.displayName || request.workerId} · {request.startDate}–{request.endDate}</span><span className={`rounded-full px-2 py-1 font-black ${request.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{request.status}</span></div>{onSaveLeave && <div className="mt-2 flex flex-wrap justify-end gap-1.5">{request.status === "PENDING" && <><button type="button" onClick={() => updateLeaveStatus(request, "APPROVED")} className="rounded-lg bg-emerald-50 px-2 py-1.5 font-bold text-emerald-800">Approve</button><button type="button" onClick={() => updateLeaveStatus(request, "REJECTED")} className="rounded-lg bg-rose-50 px-2 py-1.5 font-bold text-rose-800">Reject</button></>}{request.status === "APPROVED" && <button type="button" onClick={() => updateLeaveStatus(request, "CANCELLED")} className="rounded-lg bg-slate-200 px-2 py-1.5 font-bold text-slate-700">Cancel</button>}</div>}</div>)}</section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><h4 className="text-sm font-black">Overtime approvals</h4><p className="mt-1 text-[10px] text-slate-500">Only approved explicit overtime affects payroll. Legacy time-entry OT remains a fallback when no approved request exists.</p></div><RotateCcw className="h-4 w-4 text-violet-600" /></div>{onSaveOvertime && <form onSubmit={saveOvertime} className="mt-3 space-y-2"><select disabled={!canManagePayrollSources} value={overtimeForm.workerId} onChange={(event) => setOvertimeForm({ ...overtimeForm, workerId: event.target.value })} className="field-input">{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.displayName}</option>)}</select><div className="grid grid-cols-2 gap-2"><input disabled={!canManagePayrollSources} type="date" value={overtimeForm.date} onChange={(event) => setOvertimeForm({ ...overtimeForm, date: event.target.value })} className="field-input" /><input disabled={!canManagePayrollSources} type="number" min="0" step="0.25" value={overtimeForm.hours} onChange={(event) => setOvertimeForm({ ...overtimeForm, hours: event.target.value })} placeholder="Hours" className="field-input" /></div><input disabled={!canManagePayrollSources} value={overtimeForm.reason} onChange={(event) => setOvertimeForm({ ...overtimeForm, reason: event.target.value })} placeholder="Reason" className="field-input" /><button disabled={!canManagePayrollSources} className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Request overtime</button></form>}{overtimeRequests.filter((request) => request.overtimeDate === date).slice(0, 5).map((request) => <div key={request.id} className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-[10px]"><div><p className="font-bold">{workers.find((worker) => worker.id === request.workerId)?.displayName || request.workerId}</p><p className="text-slate-500">{(request.requestedMinutes / 60).toFixed(2)}h requested · {request.reason || "No reason"}</p></div><div className="flex items-center gap-1.5">{request.status === "PENDING" && onSaveOvertime ? <button type="button" disabled={!canManagePayrollSources} onClick={() => onSaveOvertime({ ...request, status: "APPROVED", approvedMinutes: request.requestedMinutes, approvedAt: now(), updatedAt: now() })} className="rounded-lg bg-emerald-50 px-2 py-1.5 font-bold text-emerald-800 disabled:opacity-40">Approve</button> : <span className="rounded-full bg-slate-100 px-2 py-1 font-black">{request.status}</span>}{request.status === "APPROVED" && canManagePayrollSources && <button type="button" onClick={() => runSourceLifecycle("OVERTIME", request.id, "CANCEL")} className="text-[10px] font-bold text-amber-700">Cancel</button>}</div></div>)}</section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><div><h4 className="text-sm font-black">Holiday context</h4><p className="mt-1 text-[10px] text-slate-500">Company-defined classification only; premium pay requires a configured policy.</p></div><CalendarDays className="h-4 w-4 text-amber-600" /></div>{onSaveHoliday && <form onSubmit={saveHoliday} className="mt-3 space-y-2"><input type="date" value={holidayForm.date} onChange={(event) => setHolidayForm({ ...holidayForm, date: event.target.value })} className="field-input" /><input value={holidayForm.name} onChange={(event) => setHolidayForm({ ...holidayForm, name: event.target.value })} placeholder="Holiday name" className="field-input" /><button className="inline-flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> Add holiday</button></form>}{holidays.filter((holiday) => holiday.active && holiday.holidayDate >= date).slice(0, 4).map((holiday) => <div key={holiday.id} className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 p-3 text-[10px]"><span className="font-bold">{holiday.holidayDate} · {holiday.name}</span><span className="text-amber-800">Context only</span></div>)}</section>
    </div>
  </section>;
};
