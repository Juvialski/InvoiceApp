import React, { useEffect, useMemo, useState } from "react";
import { Archive, ArrowRight, ArrowUpRight, FileText, History, LockKeyhole, Mail, Search, Settings2 } from "lucide-react";
import type { ClientBilling } from "../../lib/clientBilling.ts";
import type { EngineeringDocumentsWorkspaceData } from "../../lib/engineeringDocuments.ts";
import type { CashBankingWorkspaceData } from "../../lib/cashBanking.ts";
import { DEFAULT_COMPANY_DOCUMENT_PROFILE } from "../../lib/companyDocumentProfile.ts";
import { buildDocumentRegister, buildFinancialDocumentSnapshot, type DocumentRegisterEntry, type DocumentRegisterKind, type DocumentRegisterOrigin } from "../../lib/documentRegister.ts";
import { appPathForDocumentsWorkspace, appPathForEmailWorkspace, appPathForManagedDocument, type DocumentWorkspaceView } from "../../utils/appRouting.ts";
import { listManagedDocuments, type ManagedDocumentDetail, type ManagedDocumentSummary } from "../../lib/managedDocuments.ts";
import { hasAnyPermission, hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { useAppPermissions } from "../AppPermissionContext.tsx";
import { useOptionalCompanyAccess } from "../../context/CompanyAccessContext.tsx";
import { DocumentPreviewModal } from "../../components/DocumentPreviewModal.tsx";
import { CompanyDocumentTemplatesSettings } from "../../components/access/CompanyDocumentTemplatesSettings.tsx";
import { DocumentCreateView } from "../../components/documents/DocumentCreateView.tsx";
import { ManagedDocumentDetailView } from "../../components/documents/ManagedDocumentDetailView.tsx";
import type { Expense, InvoiceData, Project, PurchaseOrder, Vendor } from "../../types.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";
import { DisclosureSection, FilterBar, PageHeader } from "../../components/ui/OperationsUI.tsx";

export interface DocumentsRouteProps {
  readonly view?: DocumentWorkspaceView;
  readonly demoMode?: boolean;
  readonly invoices: readonly InvoiceData[];
  readonly clientBillings: readonly ClientBilling[];
  readonly purchaseOrders: readonly PurchaseOrder[];
  readonly expenses: readonly Expense[];
  readonly projects: readonly Project[];
  readonly vendors: readonly Vendor[];
  readonly cashData?: CashBankingWorkspaceData;
  readonly engineeringDocumentsData?: EngineeringDocumentsWorkspaceData;
  readonly onNavigatePath?: AppNavigate;
  readonly companyId?: string;
  readonly managedDocuments?: readonly ManagedDocumentSummary[];
  readonly managedDocumentDetails?: readonly ManagedDocumentDetail[];
  readonly managedDocumentId?: string;
}

const KIND_LABELS: Record<DocumentRegisterKind, string> = {
  PURCHASE_ORDER: "Purchase Order",
  CLIENT_INVOICE: "Client Invoice",
  SUPPLIER_INVOICE: "Supplier Invoice",
  EXPENSE_RECEIPT: "Expense receipt",
  BANK_STATEMENT: "Bank statement",
  ENGINEERING_DOCUMENT: "Engineering document",
  MANAGED_DOCUMENT: "Managed document",
  GENERATED_ARTIFACT: "Generated artifact",
};

const DOCUMENT_VIEWS: readonly { id: DocumentWorkspaceView; label: string; description: string }[] = [
  { id: "library", label: "Library", description: "Find company documents" },
  { id: "create", label: "Create", description: "Start a business workflow" },
  { id: "templates", label: "Templates", description: "Manage approved Word designs" },
];

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
  return origin === "ISSUED" ? "Issued" : origin === "ENGINEERING" ? "Engineering" : origin === "GENERATED" ? "Generated" : origin === "MANAGED" ? "Managed" : "Source / Received";
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export function DocumentsRoute({
  view = "library",
  demoMode = false,
  invoices,
  clientBillings,
  purchaseOrders,
  expenses,
  projects,
  vendors,
  cashData,
  engineeringDocumentsData,
  onNavigatePath,
  companyId,
  managedDocuments: initialManagedDocuments,
  managedDocumentDetails = [],
  managedDocumentId,
}: DocumentsRouteProps) {
  const permissions = useAppPermissions();
  const companyAccess = useOptionalCompanyAccess();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"ALL" | DocumentRegisterKind>("ALL");
  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [originFilter, setOriginFilter] = useState<"ALL" | DocumentRegisterOrigin>("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [projectFilter, setProjectFilter] = useState("ALL");
  const [counterpartyFilter, setCounterpartyFilter] = useState("ALL");
  const [previewEntry, setPreviewEntry] = useState<DocumentRegisterEntry | null>(null);
  const [managedDocuments, setManagedDocuments] = useState<readonly ManagedDocumentSummary[]>(initialManagedDocuments || []);
  const [managedLoadError, setManagedLoadError] = useState<string | null>(null);

  const visibility = useMemo(() => ({
    invoices: hasPermission(permissions, PERMISSION_KEYS.invoicesRead),
    projects: hasPermission(permissions, PERMISSION_KEYS.projectsRead),
    procurement: hasPermission(permissions, PERMISSION_KEYS.procurementRead),
    expenses: hasPermission(permissions, PERMISSION_KEYS.expensesRead),
    cash: hasPermission(permissions, PERMISSION_KEYS.cashSummaryRead) || hasPermission(permissions, PERMISSION_KEYS.cashImport),
    engineering: hasPermission(permissions, PERMISSION_KEYS.engineeringDocumentsRead),
  }), [permissions]);
  useEffect(() => {
    if (demoMode) {
      setManagedDocuments(initialManagedDocuments || []);
      return;
    }
    if (!companyId || !hasAnyPermission(permissions, [PERMISSION_KEYS.documentsRead, PERMISSION_KEYS.documentsManage, PERMISSION_KEYS.procurementRead, PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.reportsRead, PERMISSION_KEYS.settingsRead])) return;
    let cancelled = false;
    setManagedLoadError(null);
    void listManagedDocuments(companyId).then((rows) => { if (!cancelled) setManagedDocuments(rows); }).catch((caught) => { if (!cancelled) setManagedLoadError(caught instanceof Error ? caught.message : "Managed Documents could not be loaded safely."); });
    return () => { cancelled = true; };
  }, [companyId, demoMode, initialManagedDocuments, permissions]);
  const entries = useMemo(() => buildDocumentRegister({ invoices, clientBillings, purchaseOrders, expenses, projects, vendors, importBatches: cashData?.importBatches, engineering: engineeringDocumentsData, managedDocuments, visibility }), [cashData?.importBatches, clientBillings, engineeringDocumentsData, expenses, invoices, managedDocuments, permissions, projects, purchaseOrders, vendors, visibility]);
  const modules = useMemo(() => [...new Set(entries.map((entry) => entry.module))].sort(), [entries]);
  const statuses = useMemo(() => [...new Set(entries.map((entry) => entry.status))].sort(), [entries]);
  const projectOptions = useMemo(() => [...new Map(entries.filter((entry) => entry.projectId && entry.projectLabel).map((entry) => [entry.projectId, { id: entry.projectId!, label: entry.projectLabel! }])).values()].sort((left, right) => left.label.localeCompare(right.label)), [entries]);
  const counterpartyOptions = useMemo(() => [...new Set(entries.map((entry) => entry.counterparty).filter((value): value is string => Boolean(value)))].sort(), [entries]);
  const filteredEntries = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (kindFilter !== "ALL" && entry.kind !== kindFilter) return false;
      if (moduleFilter !== "ALL" && entry.module !== moduleFilter) return false;
      if (originFilter !== "ALL" && entry.origin !== originFilter) return false;
      if (statusFilter !== "ALL" && entry.status !== statusFilter) return false;
      if (projectFilter !== "ALL" && entry.projectId !== projectFilter) return false;
      if (counterpartyFilter !== "ALL" && entry.counterparty !== counterpartyFilter) return false;
      return !normalizedQuery || entry.searchableText.includes(normalizedQuery);
    });
  }, [counterpartyFilter, entries, kindFilter, moduleFilter, originFilter, projectFilter, search, statusFilter]);

  const canSend = hasPermission(permissions, PERMISSION_KEYS.documentSend);
  const canReadTemplates = demoMode
    || Boolean(companyAccess?.guestMode)
    || hasPermission(permissions, PERMISSION_KEYS.settingsRead)
    || hasPermission(permissions, PERMISSION_KEYS.companyManage);
  const navigateView = (nextView: DocumentWorkspaceView) => go(appPathForDocumentsWorkspace(nextView), onNavigatePath);
  const snapshotFor = (entry: DocumentRegisterEntry) => buildFinancialDocumentSnapshot(entry, { purchaseOrders, clientBillings, projects, vendors, profile: DEFAULT_COMPANY_DOCUMENT_PROFILE });
  const hasActiveFilters = Boolean(search.trim() || kindFilter !== "ALL" || moduleFilter !== "ALL" || originFilter !== "ALL" || statusFilter !== "ALL" || projectFilter !== "ALL" || counterpartyFilter !== "ALL");
  const selectedManagedDocument = managedDocumentDetails.find((document) => document.id === managedDocumentId);

  return (
    <section className="space-y-5" data-documents-workspace="true" aria-label="Documents workspace">
      <PageHeader
        eyebrow="Company document center"
        title="Documents"
        description={view === "library" ? "Find, preview, and continue work on document records from across your company workflows." : view === "create" ? "Start a supported business document workflow from one clear place." : "Manage Document templates and their reviewed versions."}
        actions={<div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => go(appPathForEmailWorkspace("compose", { returnTo: appPathForDocumentsWorkspace(view) }), onNavigatePath)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-50"><Mail className="h-3.5 w-3.5" />Compose</button><button type="button" onClick={() => navigateView("create")} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700"><ArrowRight className="h-3.5 w-3.5" />Create document</button>{view !== "templates" && <button type="button" onClick={() => navigateView("templates")} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><Settings2 className="h-3.5 w-3.5" />Templates</button>}</div>}
      />

      <nav className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Documents sections" role="tablist" data-document-center-nav="true">
        {DOCUMENT_VIEWS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={view === item.id} aria-current={view === item.id ? "page" : undefined} onClick={() => navigateView(item.id)} className={`min-w-[8rem] flex-1 rounded-lg px-3 py-2 text-left transition sm:flex-none ${view === item.id ? "bg-indigo-50 text-indigo-800" : "text-slate-600 hover:bg-slate-50"}`} data-document-center-view={item.id}><span className="block text-xs font-black">{item.label}</span><span className="mt-0.5 block text-[10px] text-current/70">{item.description}</span></button>)}
      </nav>

      {managedLoadError && view === "library" && !managedDocumentId && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{managedLoadError}</div>}

      {managedDocumentId && <ManagedDocumentDetailView companyId={companyId} documentId={managedDocumentId} demoMode={demoMode} initialDocument={selectedManagedDocument} onBack={() => go(appPathForDocumentsWorkspace("library"), onNavigatePath)} onChanged={(document) => setManagedDocuments((current) => current.some((row) => row.id === document.id) ? current.map((row) => row.id === document.id ? document : row) : [document, ...current])} />}

      {view === "create" && !managedDocumentId && <DocumentCreateView onNavigatePath={onNavigatePath} projects={projects} purchaseOrders={purchaseOrders} clientBillings={clientBillings} companyId={companyId} demoMode={demoMode} onManagedDocumentCreated={(document) => { setManagedDocuments((current) => [document, ...current.filter((row) => row.id !== document.id)]); go(appPathForManagedDocument(document.id), onNavigatePath); }} />}

      {view === "templates" && <div data-document-templates-view="true">{canReadTemplates ? <CompanyDocumentTemplatesSettings demoMode={demoMode || Boolean(companyAccess?.guestMode)} /> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center" role="status"><LockKeyhole className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm font-black text-slate-800">Template administration is restricted</p><p className="mt-1 text-xs leading-5 text-slate-500">Ask a company settings administrator to review or manage approved Word templates.</p></div>}</div>}

      {view === "library" && !managedDocumentId && <>
        <FilterBar ariaLabel="Document filters" resultLabel={filteredEntries.length + " of " + entries.length + " documents"} hasActiveFilters={hasActiveFilters} onReset={() => { setSearch(""); setKindFilter("ALL"); setModuleFilter("ALL"); setOriginFilter("ALL"); setStatusFilter("ALL"); setProjectFilter("ALL"); setCounterpartyFilter("ALL"); }}>
          <label className="relative min-w-0 flex-1 sm:min-w-[220px]"><span className="sr-only">Search documents</span><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input className="field-input pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents…" /></label>
          <label className="min-w-[10rem]"><span className="field-label">Type</span><select className="field-input" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}><option value="ALL">All types</option>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </FilterBar>
        <DisclosureSection title="More filters" description="Narrow by project, counterparty, owning module, origin, or status." className="mt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label><span className="field-label">Project</span><select className="field-input" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="ALL">All projects</option>{projectOptions.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}</select></label><label><span className="field-label">Client / supplier</span><select className="field-input" value={counterpartyFilter} onChange={(event) => setCounterpartyFilter(event.target.value)}><option value="ALL">All counterparties</option>{counterpartyOptions.map((counterparty) => <option key={counterparty} value={counterparty}>{counterparty}</option>)}</select></label><label><span className="field-label">Owning module</span><select className="field-input" value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}><option value="ALL">All modules</option>{modules.map((module) => <option key={module} value={module}>{module}</option>)}</select></label><label><span className="field-label">Origin</span><select className="field-input" value={originFilter} onChange={(event) => setOriginFilter(event.target.value as typeof originFilter)}><option value="ALL">All origins</option><option value="SOURCE">Source / Received</option><option value="ISSUED">Issued</option><option value="ENGINEERING">Engineering</option><option value="MANAGED">Managed</option><option value="GENERATED">Generated</option></select></label><label><span className="field-label">Status</span><select className="field-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label></div>
        </DisclosureSection>

        {filteredEntries.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500"><Archive className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 font-black text-slate-700">No documents match the current view</p><p className="mt-1">Clear a filter or open the owning workflow to create or receive a supported record.</p></div> : <div className="space-y-3" data-documents-list="true">{filteredEntries.map((entry) => <DocumentCard key={entry.id} entry={entry} canSend={canSend} onPreview={() => setPreviewEntry(entry)} onOpenOwner={() => go(entry.ownerPath, onNavigatePath)} onSend={() => entry.documentType && entry.documentId && go(appPathForEmailWorkspace("compose", { documentType: entry.documentType, documentId: entry.documentId, returnTo: "/documents" }), onNavigatePath)} onHistory={() => go(appPathForEmailWorkspace("sent", { ...(entry.documentType && entry.documentId ? { documentType: entry.documentType, documentId: entry.documentId } : {}), returnTo: "/documents" }), onNavigatePath)} />)}</div>}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600" aria-label="Document summary"><span><strong className="text-slate-900">{entries.length}</strong> visible records</span><span><strong className="text-slate-900">{filteredEntries.length}</strong> in current view</span><span><strong className="text-slate-900">{entries.filter((entry) => entry.emailEligible).length}</strong> issued or sendable</span><span><strong className="text-slate-900">{entries.filter((entry) => entry.origin === "SOURCE").length}</strong> source documents</span></div>

        {previewEntry && <DocumentPreviewModal document={snapshotFor(previewEntry)} onClose={() => setPreviewEntry(null)} />}
      </>}
    </section>
  );
}

function DocumentCard({ entry, canSend, onPreview, onOpenOwner, onSend, onHistory }: { entry: DocumentRegisterEntry; canSend: boolean; onPreview: () => void; onOpenOwner: () => void; onSend: () => void; onHistory: () => void }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-document-register-entry={entry.id} data-document-kind={entry.kind}>
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div className="flex min-w-0 items-start gap-3"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><FileText className="h-4 w-4" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-sm font-black text-slate-950">{entry.title}</h3><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${statusClass(entry.status)}`}>{statusLabel(entry.status)}</span></div><p className="mt-1 break-words text-xs text-slate-600">{entry.subtitle || "No additional metadata recorded"}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500"><span>{KIND_LABELS[entry.kind]}</span><span>{entry.module}</span><span>{originLabel(entry.origin)}</span><span>{dateLabel(entry.date)}</span></div></div></div><div className="flex shrink-0 flex-wrap gap-2 md:max-w-[22rem] md:justify-end"><button type="button" onClick={onOpenOwner} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-700 hover:bg-slate-50"><ArrowUpRight className="h-3 w-3" />{entry.managedDocumentId ? "Open document" : "Open owning record"}</button>{entry.documentType && entry.documentId && <><button type="button" onClick={onPreview} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[10px] font-black text-indigo-700 hover:bg-indigo-100"><FileText className="h-3 w-3" />Preview / Download</button><button type="button" onClick={onHistory} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-700 hover:bg-slate-50"><History className="h-3 w-3" />Delivery history</button><button type="button" onClick={onSend} disabled={!canSend} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"><Mail className="h-3 w-3" />Send</button></>}</div></div>
    {entry.emailEligible && !canSend && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-900">Sending is hidden for this access profile. The owning record and immutable preview remain available.</p>}
    {entry.sourceDocumentId && <p className="mt-3 break-words text-[10px] text-slate-400">Source document on file · {entry.artifactName || "source artifact"}</p>}
  </article>;
}

export default DocumentsRoute;
