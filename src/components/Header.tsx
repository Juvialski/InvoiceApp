import React from "react";
import {
  BarChart3,
  FilePlus2,
  Files,
  Mail,
  Building2,
  Download,
  ClipboardCheck,
  Settings as SettingsIcon,
} from "lucide-react";

export type AppTab = "dashboard" | "extractor" | "inbox" | "review" | "invoices" | "vendors" | "reports" | "settings";

interface HeaderProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  invoicesCount: number;
  reviewCount: number;
  onBatchExportExcel: () => void;
}

const tabs: Array<{ id: AppTab; label: string; icon: React.ElementType }> = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "extractor", label: "Extract", icon: FilePlus2 },
  { id: "inbox", label: "Gmail Inbox", icon: Mail },
  { id: "review", label: "Review Queue", icon: ClipboardCheck },
  { id: "invoices", label: "Invoices", icon: Files },
  { id: "vendors", label: "Vendors", icon: Building2 },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, invoicesCount, reviewCount, onBatchExportExcel }) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="min-h-16 py-3 flex flex-col xl:flex-row xl:items-center gap-3 xl:justify-between overflow-hidden">
          <div className="flex items-center justify-between gap-3 min-w-0 xl:flex-1">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0"><Files className="w-5 h-5" /></div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Invoice Operations</h1>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">Invoice intake → extraction → review → verified record</p>
              </div>
            </div>
            {invoicesCount > 0 && <button onClick={onBatchExportExcel} className="xl:hidden p-2 rounded-xl bg-indigo-600 text-white" title="Export all invoices"><Download className="w-4 h-4" /></button>}
          </div>

          <div className="flex items-center gap-2 min-w-0 xl:flex-1">
            <nav className="flex min-w-0 max-w-full overflow-x-auto no-scrollbar bg-slate-100 p-1 rounded-xl border border-slate-200/80 flex-1">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setActiveTab(id)} className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${activeTab === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                  <Icon className="w-3.5 h-3.5" /><span>{label}</span>
                  {id === "invoices" && invoicesCount > 0 && <span className="ml-0.5 text-[9px] bg-indigo-600 text-white px-1.5 rounded-full">{invoicesCount}</span>}
                  {id === "review" && reviewCount > 0 && <span className="ml-0.5 text-[9px] bg-amber-500 text-white px-1.5 rounded-full">{reviewCount}</span>}
                </button>
              ))}
            </nav>
            {invoicesCount > 0 && <button onClick={onBatchExportExcel} className="hidden xl:flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-md shadow-indigo-200 whitespace-nowrap"><Download className="w-3.5 h-3.5" /> Export All</button>}
          </div>
        </div>
      </div>
    </header>
  );
};
