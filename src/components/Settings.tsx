import React from "react";
import { CheckCircle2, Clock3, Globe2, MapPin, RotateCcw } from "lucide-react";
import { DEFAULT_COUNTRY, DEFAULT_CURRENCY, DEFAULT_LOCALE, DEFAULT_TIMEZONE, RegionalSettings } from "../config/regional";
import { FeatureStatusOverview } from "./FeatureStatusOverview";
import { PageHeader, SectionHeader, StatusBadge } from "./ui/OperationsUI";
import { DeploymentAccessManagement } from "./access/DeploymentAccessManagement.tsx";
import { CompanyProfileSettings } from "./access/CompanyProfileSettings.tsx";

interface SettingsProps {
  settings: RegionalSettings;
  onChange: (settings: RegionalSettings) => void;
  showDeploymentAccessManagement?: boolean;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onChange, showDeploymentAccessManagement = true }) => {
  const isDeploymentProfile = settings.country === DEFAULT_COUNTRY
    && settings.locale === DEFAULT_LOCALE
    && settings.currency === DEFAULT_CURRENCY
    && settings.timezone === DEFAULT_TIMEZONE;

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader eyebrow="Workspace configuration" title="Operational settings" description="This Engoryx deployment belongs to one client company. Roles and permissions control what each company user can access." />

      {showDeploymentAccessManagement && <CompanyProfileSettings />}

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0"><Globe2 className="w-5 h-5" /></div>
          <div><SectionHeader title="Regional display preferences" description={showDeploymentAccessManagement ? "These browser preferences control presentation. The shared deployment company name, currency, and timezone are managed in Company profile above." : "These demo/browser preferences control presentation only. Production company profile controls are intentionally not mounted here."} /></div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          <div className="rounded-xl bg-slate-50 p-3 flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-indigo-600" /><span className="text-xs">Country: <strong>{settings.country}</strong></span></div>
          <div className="rounded-xl bg-slate-50 p-3 flex items-center gap-2"><Globe2 className="w-3.5 h-3.5 text-indigo-600" /><span className="text-xs">Locale: <strong>{settings.locale}</strong></span></div>
          <div className="rounded-xl bg-slate-50 p-3 flex items-center gap-2"><span className="w-3.5 text-center text-indigo-600 font-black">{settings.currency}</span><span className="text-xs">Currency</span></div>
          <div className="rounded-xl bg-slate-50 p-3 flex items-center gap-2"><Clock3 className="w-3.5 h-3.5 text-indigo-600" /><span className="text-xs">Timezone: <strong>{settings.timezone}</strong></span></div>
        </div>

        <div className="mt-5 grid sm:grid-cols-2 gap-3 text-[10px]">
          <div className="rounded-xl border border-slate-200 p-3"><p className="font-black uppercase text-slate-500">Currency handling</p><p className="mt-1 text-slate-600">Source currencies remain visible on imported invoices. No automatic conversion is applied.</p></div>
          <div className="rounded-xl border border-slate-200 p-3"><p className="font-black uppercase text-slate-500">Review checks</p><p className="mt-1 text-slate-600">VAT, completeness, and reconciliation checks stay available for reviewer action.</p></div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${isDeploymentProfile ? "text-emerald-700" : "text-amber-700"}`}>
            {isDeploymentProfile ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock3 className="w-3.5 h-3.5" />}
            {isDeploymentProfile ? <StatusBadge tone="success">Browser display defaults active</StatusBadge> : <StatusBadge tone="warning">Custom regional preferences active</StatusBadge>}
          </p>
          {!isDeploymentProfile && <button type="button" onClick={() => onChange({ country: DEFAULT_COUNTRY, locale: DEFAULT_LOCALE, currency: DEFAULT_CURRENCY, timezone: DEFAULT_TIMEZONE })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-50"><RotateCcw className="w-3 h-3" />Restore deployment defaults</button>}
        </div>
      </section>

      {showDeploymentAccessManagement && <DeploymentAccessManagement />}
      <FeatureStatusOverview />
    </div>
  );
};
