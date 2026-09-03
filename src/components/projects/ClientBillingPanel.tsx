import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, ClipboardList, FilePlus2, Lock, Pencil, Plus, Send, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import type { Project } from "../../types.ts";
import {
  calculateClientBillingSummary,
  clientBillingTotal,
  isClientBillingProjectStatusAllowed,
  type ClientBilling,
  type ClientBillingEvent,
  type ClientBillingInput,
  type ClientBillingLineInput,
  type ClientBillingStatus,
} from "../../lib/clientBilling.ts";
import { StatusBadge, type StatusTone } from "../ui/OperationsUI.tsx";

interface ClientBillingPanelProps {
  project: Project;
  billings: readonly ClientBilling[];
  events: readonly ClientBillingEvent[];
  loading?: boolean;
  canManage?: boolean;
  onSave: (input: ClientBillingInput, lines: readonly ClientBillingLineInput[]) => Promise<void> | void;
  onTransition: (id: string, targetStatus: ClientBillingStatus, reason?: string) => Promise<void> | void;
}

function money(value: number | undefined, currency: string) {
  if (value === undefined || !Number.isFinite(value)) return "Unavailable";
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function statusTone(status: ClientBillingStatus): StatusTone {
  return status === "ISSUED" ? "success" : status === "VOIDED" || status === "CANCELLED" ? "neutral" : status === "SUBMITTED" ? "warning" : "info";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nextBillingNumber(project: Project, count: number) {
  return `PB-${project.projectCode || "PROJECT"}-${String(count + 1).padStart(3, "0")}`.toUpperCase();
}

function emptyLine(): ClientBillingLineInput {
  return { description: "", amount: 0 };
}

function formFromBilling(billing: ClientBilling): { input: ClientBillingInput; lines: ClientBillingLineInput[] } {
  return {
    input: {
      id: billing.id,
      projectId: billing.projectId,
      billingNumber: billing.billingNumber,
      billingDate: billing.billingDate,
      periodStart: billing.periodStart,
      periodEnd: billing.periodEnd,
      clientNameSnapshot: billing.clientNameSnapshot,
      clientReferenceSnapshot: billing.clientReferenceSnapshot,
      currency: billing.currency,
      notes: billing.notes,
    },
    lines: billing.lines.map((line) => ({ description: line.description, amount: line.amount, notes: line.notes })),
  };
}

export const ClientBillingPanel: React.FC<ClientBillingPanelProps> = ({ project, billings, events, loading = false, canManage = false, onSave, onTransition }) => {
  const projectBillings = useMemo(() => billings.filter((billing) => billing.projectId === project.id), [billings, project.id]);
  const projectEvents = useMemo(() => events.filter((event) => projectBillings.some((billing) => billing.id === event.billingId)), [events, projectBillings]);
  const summary = useMemo(() => calculateClientBillingSummary(project, projectBillings), [project, projectBillings]);
  const [selectedId, setSelectedId] = useState<string | null>(projectBillings[0]?.id || null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ClientBillingInput>(() => ({ projectId: project.id, billingNumber: nextBillingNumber(project, projectBillings.length), billingDate: today(), clientNameSnapshot: project.clientName, clientReferenceSnapshot: project.clientReference, currency: project.currency }));
  const [lines, setLines] = useState<ClientBillingLineInput[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = projectBillings.find((billing) => billing.id === selectedId) || projectBillings[0];
  const metricCards: Array<[string, number | undefined]> = [
    ["Contract Value", summary.contractValue],
    ["Billed to Date", summary.billedToDate],
    ["Remaining to Bill", summary.remainingToBill],
    ["Issued Billings", summary.issuedBillingCount],
  ];

  useEffect(() => {
    if (selectedId && projectBillings.some((billing) => billing.id === selectedId)) return;
    setSelectedId(projectBillings[0]?.id || null);
  }, [projectBillings, selectedId]);

  const startCreate = () => {
    setError(null);
    setForm({ projectId: project.id, billingNumber: nextBillingNumber(project, projectBillings.length), billingDate: today(), clientNameSnapshot: project.clientName, clientReferenceSnapshot: project.clientReference, currency: project.currency });
    setLines([emptyLine()]);
    setEditing(true);
    setSelectedId(null);
  };

  const startEdit = (billing: ClientBilling) => {
    const next = formFromBilling(billing);
    setError(null);
    setForm(next.input);
    setLines(next.lines.length ? next.lines : [emptyLine()]);
    setSelectedId(billing.id);
    setEditing(true);
  };

  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.billingNumber?.trim()) { setError("Billing number is required."); return; }
    if (!lines.length || lines.some((line) => !line.description.trim())) { setError("Every billing line needs a description."); return; }
    if (lines.some((line) => !Number.isFinite(Number(line.amount)) || Number(line.amount) < 0)) { setError("Billing line amounts must be zero or greater."); return; }
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...form, projectId: project.id, currency: project.currency }, lines.map((line) => ({ ...line, description: line.description.trim(), amount: Number(line.amount) || 0 })));
      setEditing(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const transition = async (billing: ClientBilling, target: ClientBillingStatus) => {
    if (busy) return;
    let reason: string | undefined;
    if (target === "DRAFT" || target === "CANCELLED" || target === "VOIDED") {
      reason = typeof window !== "undefined" ? window.prompt(target === "VOIDED" ? "Reason for voiding this issued client billing:" : target === "CANCELLED" ? "Reason for cancelling this client billing:" : "Reason for returning this billing to draft:") || undefined : undefined;
      if (!reason?.trim()) return;
    } else if (target === "ISSUED") {
      const confirmed = typeof window === "undefined" || window.confirm("Issue this client billing? Only issued billings contribute to Billed to Date, and the database will recheck the project contract ceiling.");
      if (!confirmed) return;
    } else if (target === "SUBMITTED") {
      const confirmed = typeof window === "undefined" || window.confirm("Submit this billing for issue review?");
      if (!confirmed) return;
    }
    setBusy(true);
    setError(null);
    try {
      await onTransition(billing.id, target, reason);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <section aria-labelledby="client-billing-editor-heading" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Client progress billing</p>
            <h2 id="client-billing-editor-heading" className="mt-1 text-xl font-black text-slate-950">{form.id ? "Edit billing draft" : "Create billing draft"}</h2>
            <p className="mt-1 text-xs text-slate-500">Revenue-side project history only. Saving a draft does not bill the client, change project cost, or create cash activity.</p>
          </div>
          <Button variant="secondary" label="Cancel" onClick={() => setEditing(false)} />
        </div>
        <form onSubmit={saveDraft} className="space-y-4">
          <Card className="p-5 shadow-sm" elevation="low">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1"><span className="field-label">Billing number</span><input className="field-input" value={form.billingNumber || ""} onChange={(event) => setForm((current) => ({ ...current, billingNumber: event.target.value }))} required /></label>
              <label className="space-y-1"><span className="field-label">Billing date</span><input className="field-input" type="date" value={form.billingDate || ""} onChange={(event) => setForm((current) => ({ ...current, billingDate: event.target.value }))} required /></label>
              <label className="space-y-1"><span className="field-label">Period start</span><input className="field-input" type="date" value={form.periodStart || ""} onChange={(event) => setForm((current) => ({ ...current, periodStart: event.target.value || undefined }))} /></label>
              <label className="space-y-1"><span className="field-label">Period end</span><input className="field-input" type="date" value={form.periodEnd || ""} onChange={(event) => setForm((current) => ({ ...current, periodEnd: event.target.value || undefined }))} /></label>
              <label className="space-y-1 sm:col-span-2"><span className="field-label">Client snapshot</span><input className="field-input bg-slate-50" value={form.clientNameSnapshot || ""} onChange={(event) => setForm((current) => ({ ...current, clientNameSnapshot: event.target.value }))} placeholder={project.clientName || "Client not set"} /></label>
              <label className="space-y-1 sm:col-span-2"><span className="field-label">Client reference</span><input className="field-input" value={form.clientReferenceSnapshot || ""} onChange={(event) => setForm((current) => ({ ...current, clientReferenceSnapshot: event.target.value || undefined }))} /></label>
              <label className="space-y-1 sm:col-span-4"><span className="field-label">Notes</span><textarea className="field-input min-h-20" value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value || undefined }))} /></label>
            </div>
          </Card>
          <Card className="overflow-hidden p-0 shadow-sm" elevation="low">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h3 className="text-sm font-black">Billing lines</h3><p className="mt-1 text-[10px] text-slate-500">Line values are the source of the billing total.</p></div><button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700" onClick={() => setLines((current) => [...current, emptyLine()])}><Plus className="h-3.5 w-3.5" /> Add line</button></div>
            <div className="divide-y divide-slate-100">
              {lines.map((line, index) => (
                <div key={index} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_170px_40px] sm:items-end">
                  <label className="space-y-1"><span className="field-label">Description {index + 1}</span><input className="field-input" value={line.description} onChange={(event) => setLines((current) => current.map((candidate, lineIndex) => lineIndex === index ? { ...candidate, description: event.target.value } : candidate))} required /></label>
                  <label className="space-y-1"><span className="field-label">Amount ({project.currency})</span><input className="field-input text-right" type="number" min="0" step="0.01" value={line.amount} onChange={(event) => setLines((current) => current.map((candidate, lineIndex) => lineIndex === index ? { ...candidate, amount: Number(event.target.value) || 0 } : candidate))} required /></label>
                  <button type="button" aria-label={`Remove billing line ${index + 1}`} className="inline-flex h-10 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-4"><span className="text-xs font-bold text-slate-600">Current billing total</span><span className="text-lg font-black tabular-nums text-slate-950">{money(clientBillingTotal({ lines: lines.map((line) => ({ amount: Number(line.amount) || 0 })) }), project.currency)}</span></div>
          </Card>
          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}
          <div className="flex flex-wrap items-center justify-end gap-2"><Button variant="secondary" label="Cancel" onClick={() => setEditing(false)} /><button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"><FilePlus2 className="h-3.5 w-3.5" />{busy ? "Saving…" : "Save draft"}</button></div>
        </form>
      </section>
    );
  }

  const selectedEvents = selected ? projectEvents.filter((event) => event.billingId === selected.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt)) : [];
  const projectCanReceiveBilling = isClientBillingProjectStatusAllowed(project.status);

  return (
    <section aria-labelledby="client-billing-heading" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Commercial controls</p><h2 id="client-billing-heading" className="mt-1 text-xl font-black text-slate-950">Client progress billing</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Project-level client billing truth. Only ISSUED billings count toward Billed to Date; drafts, submitted, cancelled, and voided records do not.</p></div>
        {canManage && <button type="button" onClick={startCreate} disabled={!projectCanReceiveBilling || loading} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> New billing draft</button>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metricCards.map(([label, value]) => <Card key={label} className="p-4 shadow-sm" elevation="low"><p className="text-[10px] font-semibold text-slate-500">{label}</p><p className="mt-1 text-base font-black tabular-nums text-slate-950">{label === "Issued Billings" ? String(value) : money(value, summary.currency)}</p><p className="mt-1 text-[9px] text-slate-400">{label === "Billed to Date" ? "ISSUED only" : label === "Remaining to Bill" ? "Contract less issued billing" : label === "Issued Billings" ? `${summary.totalBillingCount} total records` : "Project authority"}</p></Card>)}
      </div>

      {summary.hasCurrencyMismatch && <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{summary.reason}</div>}
      {!projectCanReceiveBilling && <div role="status" className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700"><Lock className="mt-0.5 h-4 w-4 shrink-0" />New client billings can be created, submitted, or issued only while the project is PLANNING, ACTIVE, ON_HOLD, or COMPLETED. This project is {project.status}.</div>}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <Card className="overflow-hidden p-0 shadow-sm" elevation="low">
          <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h3 className="text-sm font-black">Billing register</h3><p className="mt-1 text-[10px] text-slate-500">{loading ? "Refreshing project billing history…" : `${projectBillings.length} billing record${projectBillings.length === 1 ? "" : "s"}`}</p></div><ClipboardList className="h-4 w-4 text-indigo-500" /></div>
          {loading ? <div role="status" className="p-10 text-center text-xs font-semibold text-slate-500">Loading client billing…</div> : projectBillings.length ? <div className="ops-scrollbar overflow-auto"><table className="ops-table min-w-[680px] w-full text-left text-xs"><caption className="sr-only">Client billing register</caption><thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Number / period</th><th className="px-4 py-3">Client reference</th><th className="px-4 py-3 text-right">Current amount</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{projectBillings.map((billing) => <tr key={billing.id} className={`cursor-pointer align-top hover:bg-indigo-50/40 ${selected?.id === billing.id ? "bg-indigo-50/70" : ""}`} onClick={() => setSelectedId(billing.id)}><td className="px-4 py-3"><button type="button" className="text-left"><strong className="block text-xs text-indigo-700">{billing.billingNumber}</strong><span className="mt-1 block text-[10px] text-slate-500">{billing.billingDate}{billing.periodStart || billing.periodEnd ? ` · ${billing.periodStart || "?"} – ${billing.periodEnd || "?"}` : ""}</span></button></td><td className="max-w-[180px] px-4 py-3"><span className="block truncate text-[10px] font-semibold text-slate-700">{billing.clientReferenceSnapshot || "No client reference"}</span><span className="mt-1 block truncate text-[10px] text-slate-500">{billing.clientNameSnapshot || project.clientName || "Client not set"}</span></td><td className="px-4 py-3 text-right font-black tabular-nums">{money(clientBillingTotal(billing), billing.currency)}</td><td className="px-4 py-3"><StatusBadge tone={statusTone(billing.status)}>{billing.status}</StatusBadge></td></tr>)}</tbody></table></div> : <div className="p-10 text-center"><ClipboardList className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No client billing history yet.</p><p className="mt-1 text-xs text-slate-500">Create a draft to start the project billing register. Drafts do not inflate Billed to Date.</p></div>}
        </Card>

        <Card className="p-5 shadow-sm" elevation="low">
          {selected ? <>
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Billing detail</p><h3 className="mt-1 text-base font-black text-slate-950">{selected.billingNumber}</h3><p className="mt-1 text-[10px] text-slate-500">{selected.clientNameSnapshot || project.clientName || "Client snapshot not set"} · {selected.billingDate}</p></div><StatusBadge tone={statusTone(selected.status)}>{selected.status}</StatusBadge></div>
            <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">{selected.lines.length ? selected.lines.map((line) => <div key={line.id} className="flex items-start justify-between gap-3 px-3 py-3"><span className="text-xs leading-5 text-slate-700">{line.description}</span><span className="shrink-0 text-xs font-black tabular-nums">{money(line.amount, selected.currency)}</span></div>) : <div className="px-3 py-4 text-xs text-slate-500">No lines recorded.</div>}<div className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-3"><span className="text-xs font-bold text-slate-600">Current billing amount</span><span className="text-base font-black tabular-nums">{money(clientBillingTotal(selected), selected.currency)}</span></div></div>
            {canManage && <div className="mt-4 flex flex-wrap gap-2">{selected.status === "DRAFT" && <><button type="button" onClick={() => startEdit(selected)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-bold text-slate-700"><Pencil className="h-3 w-3" /> Edit draft</button><button type="button" onClick={() => void transition(selected, "SUBMITTED")} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-2 text-[10px] font-bold text-white"><Send className="h-3 w-3" /> Submit</button><button type="button" onClick={() => void transition(selected, "CANCELLED")} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-2 text-[10px] font-bold text-rose-700"><Ban className="h-3 w-3" /> Cancel</button></>}{selected.status === "SUBMITTED" && <><button type="button" onClick={() => void transition(selected, "DRAFT")} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-bold text-slate-700"><Pencil className="h-3 w-3" /> Return to draft</button><button type="button" onClick={() => void transition(selected, "ISSUED")} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-[10px] font-bold text-white"><CheckCircle2 className="h-3 w-3" /> Issue</button><button type="button" onClick={() => void transition(selected, "CANCELLED")} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-2 text-[10px] font-bold text-rose-700"><Ban className="h-3 w-3" /> Cancel</button></>}{selected.status === "ISSUED" && <button type="button" onClick={() => void transition(selected, "VOIDED")} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-2 text-[10px] font-bold text-rose-700"><Ban className="h-3 w-3" /> Void issued billing</button>}</div>}
            <div className="mt-5 border-t border-slate-100 pt-4"><div className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-indigo-600" /><h4 className="text-xs font-black text-slate-800">Billing history</h4></div>{selectedEvents.length ? <div className="mt-3 space-y-3">{selectedEvents.map((event) => <div key={event.id} className="flex items-start gap-2 text-[10px]"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" /><div><p className="font-bold text-slate-700">{event.eventType.replaceAll("_", " ")}{event.fromStatus ? ` · ${event.fromStatus} → ${event.toStatus}` : ` · ${event.toStatus}`}</p><p className="mt-0.5 text-slate-500">{event.createdAt}{event.reason ? ` · ${event.reason}` : ""}</p></div></div>)}</div> : <p className="mt-3 text-[10px] text-slate-500">No lifecycle events available.</p>}</div>
          </> : <div className="flex min-h-[300px] items-center justify-center text-center"><div><ClipboardList className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">Select a billing record</p><p className="mt-1 text-xs text-slate-500">Detail, lifecycle actions, and history will appear here.</p></div></div>}
        </Card>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] leading-4 text-slate-600"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" /><p><strong>Collection boundary:</strong> client billing does not create cash transactions, settlement matches, collected amounts, receivables, accounting postings, tax calculations, or revenue recognition. Collections and settlement linkage are deferred to P2B-5.</p></div>
    </section>
  );
};
