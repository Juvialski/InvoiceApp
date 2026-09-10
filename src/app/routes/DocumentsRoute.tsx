import React, { useMemo, useState } from "react";
import { Archive, ArrowUpRight, FileText, Filter, FolderOpen, History, Mail, Search, Settings } from "lucide-react";
import type { ClientBilling } from "../../lib/clientBilling.ts";
import type { EngineeringDocumentsWorkspaceData } from "../../lib/engineeringDocuments.ts";
import type { CashBankingWorkspaceData } from "../../lib/cashBanking.ts";
import { DEFAULT_COMPANY_DOCUMENT_PROFILE } from "../../lib/companyDocumentProfile.ts";
import { buildDocumentRegister, buildFinancialDocumentSnapshot, type DocumentRegisterEntry, type DocumentRegisterKind, type DocumentRegisterOrigin } from "../../lib/documentRegister.ts";
import { appPathForEmailWorkspace } from "../../utils/appRouting.ts";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { useAppPermissions } from "../AppPermissionContext.tsx";
import { DocumentPreviewModal } from "../../components/DocumentPreviewModal.tsx";
import type { Expense, InvoiceData, Project, PurchaseOrder, Vendor } from "../../types.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";

export interface DocumentsRouteProps {
  readonly invoices: readonly InvoiceData[];
  readonly clientBillings: readonly ClientBilling[];
  readonly purchaseOrders: readonly PurchaseOrder[];
  readonly expenses: readonly Expense[];
  readonly projects: readonly Project[];
  readonly vendors: readonly Vendor[];
  readonly cashData?: CashBankingWorkspaceData;
  readonly engineeringDocumentsData?: EngineeringDocumentsWorkspaceData;
  readonly onNavigatePath?: AppNavigate;
}

const KIND_LABELS: Record<DocumentRegisterKind, string> = {
  PURCHASE_ORDER: "Purchase Order",
  CLIENT_INVOICE: "Client Invoice",
  SUPPLIER_INVOICE: "Supplier Invoice",
  EXPENSE_RECEIPT: "Expense receipt",
  BANK_STATEMENT: "Bank statement",
  ENGINEERING_DOCUMENT: "Engineering document",
};

function go(path: string, onNavigatePath?: AppNavigate) {
  if (onNavigatePath) onNavigatePath(path);
  else if (typeof window !== "undefined") window.location.assign(path);
}

function dateLabel(value?: string) {
  if (!value) return "Date not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(parsed);
}

function statusClass(status: string) {
  const value = status.toUpperCase();
  if (["ISSUED", "VERIFIED", "APPROVED", "RECEIVED", "ACTIVE"].includes(value)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (["VOID", "VOIDED", "CANCELLED", "ARCHIVED"].includes(value)) return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function originLabel(origin: DocumentRegisterOrigin) {
  return origin === "ISSUED" ? "Issued" : origin === "ENGINEERING" ? "Engineering" : "Source / Received";
}

export function DocumentsRoute({
  invoices,
  clientBillings,
  purchaseOrders,
  expenses,
  projects,
  vendors,
  cashData,
  engineeringDocumentsData,
  onNavigatePath,
}: DocumentsRouteProps) {
  const permissions = useAppPermissions();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"ALL" | DocumentRegisterKind>("ALL");
  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [originFilter, setOriginFilter] = useState<"ALL" | DocumentRegisterOrigin>("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [previewEntry, setPreviewEntry] = useState<DocumentRegisterEntry | null>(null);

  const visibility = useMemo(() => ({
    invoices: hasPermission(permissions, PERMISSION_KEYS.invoicesRead),
    projects: hasPermission(permissions, PERMISSION_KEYS.projectsRead),
    procurement: hasPermission(permissions, PERMISSION_KEYS.procurementRead),
    expenses: hasPermission(permissions, PERMISSION_KEYS.expensesRead),
    cash: hasPermission(permissions, PERMISSION_KEYS.cashSummaryRead) || hasPermission(permissions, PERMISSION_KEYS.cashImport),
    engineering: hasPermission(permissions, PERMISSION_KEYS.engineeringDocumentsRead),
  }), [permissions]);
  const entries = useMemo(() => buildDocumentRegister({ invoices, clientBillings, purchaseOrders, expenses, projects, vendors, importBatches: cashData?.importBatches, engineering: engineeringDocumentsData, visibility }), [cashData?.importBatches, clientBillings, engineeringDocumentsData, expenses, invoices, permissions, projects, purchaseOrders, vendors, visibility]);
  const modules = useMemo(() => [...new Set(entries.map((entry) => entry.module))].sort(), [entries]);
  const statuses = useMemo(() => [...new Set(entries.map((entry) => entry.status))].sort(), [entries]);
  const filteredEntries = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (kindFilter !== "ALL" && entry.kind !== kindFilter) return false;
      if (moduleFilter !== "ALL" && entry.module !== moduleFilter) return false;
      if (originFilter !== "ALL" && entry.origin !== originFilter) return false;
      if (statusFilter !== "ALL" && entry.status !== statusFilter) return false;
      return !normalizedQuery || entry.searchableText.includes(normalizedQuery);
    });
  }, [entries, kindFilter, moduleFilter, originFilter, search, statusFilter]);

  const canSend = hasPermission(permissions, PERMISSION_KEYS.documentSend);

  const snapshotFor = (entry: DocumentRegisterEntry) => buildFinancialDocumentSnapshot(entry, { purchaseOrders, clientBillings, projects, vendors, profile: DEFAULT_COMPANY_DOCUMENT_PROFILE });

  return (
    <section className="space-y-5" data-documents-workspace="true" aria-labelledby="documents-workspace-title">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 shadow-sm sm:flex-row sm:items-start sm:p-5">
        <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-700 shadow-sm"><FolderOpen className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-700">Unified access surface</p><h1 id="documents-workspace-title" className="mt-1 text-xl font-black text-slate-950">Documents</h1><p className="mt-1 max-w-3xl text-xs leading-5 text-indigo-950">Search and continue across company document records and immutable artifacts. Procurement, billing, supplier evidence, Expenses, Cash &amp; Banking, and Engineering remain the authoritative owners.</p></div></div>
        <div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => go(appPathForEmailWorkspace("compose", { returnTo: "/documents" }), onNavigatePath)} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-50"><Mail className="h-3.5 w-3.5" />Compose</button><button type="button" onClick={() => go("/settings", onNavigatePath)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><Settings className="h-3.5 w-3.5" />Document templates</button></div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Summary label="Visible records" value={String(entries.length)} /><Summary label="In current view" value={String(filteredEntries.length)} /><Summary label="Issued / sendable" value={String(entries.filter((entry) => entry.emailEligible).length)} /><Summary label="Source / received" value={String(entries.filter((entry) => entry.origin === "SOURCE").length)} /></div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Document filters">
        <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-indigo-600" /><h2 className="text-sm font-black text-slate-900">Document register</h2><span className="text-[10px] text-slate-400">Permission-filtered projection</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="relative sm:col-span-2 lg:col-span-1"><span className="sr-only">Search documents</span><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input className="field-input pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents…" /></label><label><span className="field-label">Type</span><select className="field-input" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}><option value="ALL">All types</option>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span className="field-label">Owning module</span><select className="field-input" value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}><option value="ALL">All modules</option>{modules.map((module) => <option key={module} value={module}>{module}</option>)}</select></label><label><span className="field-label">Origin</span><select className="field-input" value={originFilter} onChange={(event) => setOriginFilter(event.target.value as typeof originFilter)}><option value="ALL">All origins</option><option value="SOURCE">Source / Received</option><option value="ISSUED">Issued</option><option value="ENGINEERING">Engineering</option></select></label><label><span className="field-label">Status</span><select className="field-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div>
      </section>

      {filteredEntries.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500"><Archive className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 font-black text-slate-700">No documents match the current view</p><p className="mt-1">Clear a filter or open the owning workflow to create or receive a supported record.</p></div> : <div className="space-y-3">{filteredEntries.map((entry) => <DocumentCard key={entry.id} entry={entry} canSend={canSend} onPreview={() => setPreviewEntry(entry)} onOpenOwner={() => go(entry.ownerPath, onNavigatePath)} onSend={() => entry.documentType && entry.documentId && go(appPathForEmailWorkspace("compose", { documentType: entry.documentType, documentId: entry.documentId, returnTo: "/documents" }), onNavigatePath)} onHistory={() => go(appPathForEmailWorkspace("sent", { ...(entry.documentType && entry.documentId ? { documentType: entry.documentType, documentId: entry.documentId } : {}), returnTo: "/documents" }), onNavigatePath)} />)}</div>}

      {previewEntry && <DocumentPreviewModal document={snapshotFor(previewEntry)} onClose={() => setPreviewEntry(null)} />}
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-black tabular-nums text-slate-950">{value}</p></div>;
}

function DocumentCard({ entry, canSend, onPreview, onOpenOwner, onSend, onHistory }: { entry: DocumentRegisterEntry; canSend: boolean; onPreview: () => void; onOpenOwner: () => void; onSend: () => void; onHistory: () => void }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-document-register-entry={entry.id} data-document-kind={entry.kind}>
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div className="flex min-w-0 items-start gap-3"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><FileText className="h-4 w-4" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-sm font-black text-slate-950">{entry.title}</h3><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${statusClass(entry.status)}`}>{entry.status}</span></div><p className="mt-1 break-words text-xs text-slate-600">{entry.subtitle || "No additional metadata recorded"}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500"><span>{KIND_LABELS[entry.kind]}</span><span>{entry.module}</span><span>{originLabel(entry.origin)}</span><span>{dateLabel(entry.date)}</span></div></div></div><div className="flex shrink-0 flex-wrap gap-2 md:max-w-[22rem] md:justify-end"><button type="button" onClick={onOpenOwner} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-700 hover:bg-slate-50"><ArrowUpRight className="h-3 w-3" />Open owning record</button>{entry.documentType && entry.documentId && <><button type="button" onClick={onPreview} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-black text-indigo-700 hover:bg-indigo-100"><FileText className="h-3 w-3" />Preview / Download</button><button type="button" onClick={onHistory} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-700 hover:bg-slate-50"><History className="h-3 w-3" />Delivery history</button><button type="button" onClick={onSend} disabled={!canSend} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"><Mail className="h-3 w-3" />Send</button></>}</div></div>
    {entry.emailEligible && !canSend && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-900">Sending is hidden for this access profile. The owning record and immutable preview remain available.</p>}
    {entry.sourceDocumentId && <p className="mt-3 break-words text-[10px] text-slate-400">Source evidence preserved · {entry.artifactName || "source artifact"}</p>}
  </article>;
}

export default DocumentsRoute;
