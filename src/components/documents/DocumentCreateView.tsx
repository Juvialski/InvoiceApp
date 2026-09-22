import { ArrowRight, FileOutput, FileText, FolderKanban, LockKeyhole, Mail, Settings2, Upload } from "lucide-react";
import { useAppPermissions } from "../../app/AppPermissionContext.tsx";
import type { ClientBilling } from "../../lib/clientBilling.ts";
import { appPathForDocumentsWorkspace, appPathForEmailWorkspace, appPathForTab } from "../../utils/appRouting.ts";
import { hasAnyPermission, hasPermission, PERMISSION_KEYS, type PermissionKey } from "../../utils/accessControl.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";
import { SectionHeader } from "../ui/OperationsUI.tsx";
import { ManagedDocumentCreateView } from "./ManagedDocumentCreateView.tsx";
import { ManagedDocumentUploadView } from "./ManagedDocumentUploadView.tsx";
import type { ManagedDocumentDetail } from "../../lib/managedDocuments.ts";
import type { Project, PurchaseOrder } from "../../types.ts";

interface DocumentCreateViewProps {
  readonly onNavigatePath?: AppNavigate;
  readonly projects: readonly Project[];
  readonly purchaseOrders: readonly PurchaseOrder[];
  readonly clientBillings: readonly ClientBilling[];
  readonly companyId?: string;
  readonly demoMode?: boolean;
  readonly onManagedDocumentCreated?: (document: ManagedDocumentDetail) => void;
}

type CreateOption = {
  readonly id: "purchase-order" | "client-invoice" | "supplier-document" | "project-report" | "payroll-report" | "engineering-document" | "templates";
  readonly label: string;
  readonly description: string;
  readonly permissions: readonly PermissionKey[];
  readonly path: string;
  readonly icon: typeof FileText;
};

const CREATE_OPTIONS: readonly CreateOption[] = [
  {
    id: "purchase-order",
    label: "Purchase Order",
    description: "Open Procurement to prepare or continue a purchase order using its owning workflow.",
    permissions: [PERMISSION_KEYS.procurementRead],
    path: appPathForTab("procurement"),
    icon: FileText,
  },
  {
    id: "client-invoice",
    label: "Client Invoice",
    description: "Open Projects and continue client billing from the project that owns the invoice.",
    permissions: [PERMISSION_KEYS.projectsRead],
    path: appPathForTab("projects"),
    icon: FileOutput,
  },
  {
    id: "supplier-document",
    label: "Supplier document intake",
    description: "Upload and review supplier source documents without changing payable authority.",
    permissions: [PERMISSION_KEYS.invoicesExtract],
    path: appPathForTab("extractor"),
    icon: Upload,
  },
  {
    id: "project-report",
    label: "Project report",
    description: "Open Reports for existing project cost and operational report generators.",
    permissions: [PERMISSION_KEYS.reportsRead],
    path: appPathForTab("reports"),
    icon: FolderKanban,
  },
  {
    id: "payroll-report",
    label: "Payroll report",
    description: "Open Reports for payroll exports when the sensitive payroll-report permission is granted.",
    permissions: [PERMISSION_KEYS.reportsPayrollRead],
    path: appPathForTab("reports"),
    icon: FileOutput,
  },
  {
    id: "engineering-document",
    label: "Engineering document",
    description: "Open Projects and continue in the Engineering Documents owner workspace.",
    permissions: [PERMISSION_KEYS.engineeringDocumentsCreate, PERMISSION_KEYS.engineeringDocumentsRead],
    path: appPathForTab("projects"),
    icon: FileText,
  },
  {
    id: "templates",
    label: "Company DOCX template",
    description: "Manage approved Word templates, mappings, versions, and activation under Documents.",
    permissions: [PERMISSION_KEYS.settingsRead, PERMISSION_KEYS.companyManage],
    path: appPathForDocumentsWorkspace("templates"),
    icon: Settings2,
  },
];

function go(path: string, onNavigatePath?: AppNavigate) {
  if (onNavigatePath) onNavigatePath(path);
  else if (typeof window !== "undefined") window.location.assign(path);
}

export function DocumentCreateView({ onNavigatePath, projects, purchaseOrders, clientBillings, companyId, demoMode = false, onManagedDocumentCreated }: DocumentCreateViewProps) {
  const permissions = useAppPermissions();
  const available = CREATE_OPTIONS.filter((option) => hasAnyPermission(permissions, option.permissions));
  const canManageDocuments = hasPermission(permissions, PERMISSION_KEYS.documentsManage);

  return (
    <section className="space-y-4" aria-label="Create documents" data-document-create-view="true">
      <SectionHeader title="Create a document" description="Choose a workflow; the owning module keeps the record and history authoritative." />

      <ManagedDocumentUploadView companyId={companyId} projects={projects} demoMode={demoMode} canManage={canManageDocuments} onCreated={onManagedDocumentCreated} />
      <ManagedDocumentCreateView projects={projects} purchaseOrders={purchaseOrders} clientBillings={clientBillings} />

      {available.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2" data-document-create-options="true">
          {available.map((option) => {
            const Icon = option.icon;
            return (
              <button key={option.id} type="button" onClick={() => go(option.path, onNavigatePath)} className="group flex min-h-28 items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/30" data-document-create-option={option.id}>
                <span className="flex min-w-0 items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-sm font-black text-slate-950">{option.label}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{option.description}</span></span></span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600" />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center" role="status"><LockKeyhole className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm font-black text-slate-800">No creation workflows are available</p><p className="mt-1 text-xs text-slate-500">Your access profile does not include a supported document-creation workflow.</p></div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-[11px] text-indigo-950"><span className="font-bold">Need to send a document?</span><button type="button" onClick={() => go(appPathForEmailWorkspace("compose", { returnTo: "/documents?view=create" }), onNavigatePath)} className="inline-flex items-center gap-1 font-black text-indigo-700 hover:text-indigo-900"><Mail className="h-3.5 w-3.5" />Open Compose</button><button type="button" onClick={() => go(appPathForDocumentsWorkspace("templates"), onNavigatePath)} className="inline-flex items-center gap-1 font-black text-indigo-700 hover:text-indigo-900"><Settings2 className="h-3.5 w-3.5" />Manage templates</button></div>
    </section>
  );
}

export default DocumentCreateView;
