import React from "react";
import { Clock3, Coins, Globe2, MapPin, RotateCcw } from "lucide-react";
import { DEFAULT_COUNTRY, DEFAULT_CURRENCY, DEFAULT_LOCALE, DEFAULT_TIMEZONE, RegionalSettings } from "../config/regional";
import { PageHeader, SectionHeader, StatusBadge } from "./ui/OperationsUI";
import { ContextualHelp } from "./ui/ContextualHelp.tsx";
import { DeploymentAccessManagement } from "./access/DeploymentAccessManagement.tsx";
import { CompanyProfileSettings } from "./access/CompanyProfileSettings.tsx";
import { CompanyDocumentProfileSettings } from "./access/CompanyDocumentProfileSettings.tsx";
import { DeploymentAiBootstrapSettings } from "./access/DeploymentAiBootstrapSettings.tsx";
import { UserDocumentIdentitySettings } from "./access/UserDocumentIdentitySettings.tsx";
import { ProductFeaturesRoadmap } from "./ProductFeaturesRoadmap.tsx";
import { appPathForDocumentsWorkspace } from "../utils/appRouting.ts";
import type { AppNavigate } from "../utils/clientNavigation.ts";

interface SettingsProps {
  settings: RegionalSettings;
  onChange: (settings: RegionalSettings) => void;
  showDeploymentAccessManagement?: boolean;
  onNavigatePath?: AppNavigate;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onChange, showDeploymentAccessManagement = true, onNavigatePath }) => {
  const isDeploymentProfile = settings.country === DEFAULT_COUNTRY
    && settings.locale === DEFAULT_LOCALE
    && settings.currency === DEFAULT_CURRENCY
    && settings.timezone === DEFAULT_TIMEZONE;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace configuration"
        title="Operational settings"
        description="Regional settings and company access for this deployment."
      />

      <section className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 shadow-sm sm:p-5" aria-labelledby="settings-document-templates-title" data-settings-document-templates-link="true">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p id="settings-document-templates-title" className="text-sm font-black text-slate-950">Document templates</p>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Manage approved Word designs, mappings, versions, and activation from Documents.</p>
          </div>
          <button type="button" onClick={() => { const path = appPathForDocumentsWorkspace("templates"); if (onNavigatePath) onNavigatePath(path); else if (typeof window !== "undefined") window.location.assign(path); }} className="inline-flex min-h-10 items-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700">Manage Document Templates</button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {showDeploymentAccessManagement ? (
          <CompanyProfileSettings />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-center">
            <SectionHeader
              title="Deployment company"
              description="Company profile controls are database-backed in production."
            />
          </div>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm flex flex-col justify-between" aria-label="Regional display preferences">
          <div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                <Globe2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <SectionHeader
                  title="Regional display preferences"
                  description={
                    showDeploymentAccessManagement
                      ? "Display preferences only; company defaults are managed in Company Profile."
                      : "Display preferences only in this browser."
                  }
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mt-5">
              <div className="rounded-xl bg-slate-50 p-3.5 flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-medium text-slate-600">Country: <strong className="font-bold text-slate-900">{settings.country}</strong></span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5 flex items-center gap-2.5">
                <Globe2 className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-medium text-slate-600">Locale: <strong className="font-bold text-slate-900">{settings.locale}</strong></span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5 flex items-center gap-2.5">
                <Coins className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-medium text-slate-600">Currency: <strong className="font-bold text-slate-900">{settings.currency}</strong></span>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5 flex items-center gap-2.5">
                <Clock3 className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-medium text-slate-600">Timezone: <strong className="font-bold text-slate-900">{settings.timezone}</strong></span>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><ContextualHelp label="Regional display preference help" title="Regional display preferences" articleTopicId="settings">These browser preferences control presentation only. They do not change company access, financial authority, or role permissions.</ContextualHelp><span>About display preferences</span></div>

            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Currency handling</p>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">Source currencies remain visible on imported invoices. No automatic conversion is applied.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Review checks</p>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">VAT, completeness, and reconciliation checks stay available for reviewer action.</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="inline-flex items-center gap-2">
              <StatusBadge tone={isDeploymentProfile ? "success" : "warning"}>
                {isDeploymentProfile ? "Browser display defaults active" : "Custom regional preferences active"}
              </StatusBadge>
            </div>
            {!isDeploymentProfile && (
              <button
                type="button"
                onClick={() => onChange({ country: DEFAULT_COUNTRY, locale: DEFAULT_LOCALE, currency: DEFAULT_CURRENCY, timezone: DEFAULT_TIMEZONE })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restore deployment defaults
              </button>
            )}
          </div>
        </section>
      </div>

      <ProductFeaturesRoadmap />

      {showDeploymentAccessManagement && <CompanyDocumentProfileSettings />}

      {showDeploymentAccessManagement && <UserDocumentIdentitySettings />}

      {showDeploymentAccessManagement && <DeploymentAiBootstrapSettings />}

      {showDeploymentAccessManagement && <DeploymentAccessManagement />}
    </div>
  );
};
