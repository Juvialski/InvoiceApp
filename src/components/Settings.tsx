import React from "react";
import { Globe2, MapPin, Save, Clock3 } from "lucide-react";
import { DEFAULT_COUNTRY, DEFAULT_CURRENCY, DEFAULT_LOCALE, DEFAULT_TIMEZONE, RegionalSettings } from "../config/regional";

interface SettingsProps {
  settings: RegionalSettings;
  onChange: (settings: RegionalSettings) => void;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onChange }) => {
  const update = (field: keyof RegionalSettings, value: string) => onChange({ ...settings, [field]: value });
  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-xl font-black">Settings</h2>
        <p className="text-xs text-slate-500 mt-1">Regional defaults affect new/manual presentation. Imported invoices keep their detected source currency and dates.</p>
      </div>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0"><Globe2 className="w-5 h-5" /></div>
          <div><h3 className="text-sm font-black">Regional defaults</h3><p className="text-[11px] text-slate-500 mt-1">PH-first, not PH-only. Foreign invoice currencies are never converted automatically.</p></div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-5">
          <label className="text-xs font-bold text-slate-700">Country
            <select value={settings.country} onChange={(e) => update("country", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs bg-white">
              <option value="PH">Philippines</option>
              <option value="US">United States</option>
              <option value="SG">Singapore</option>
              <option value="AU">Australia</option>
              <option value="GB">United Kingdom</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">Locale
            <select value={settings.locale} onChange={(e) => update("locale", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs bg-white">
              <option value="en-PH">English (Philippines)</option>
              <option value="en-US">English (United States)</option>
              <option value="en-SG">English (Singapore)</option>
              <option value="en-GB">English (United Kingdom)</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">Default currency
            <select value={settings.currency} onChange={(e) => update("currency", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs bg-white">
              <option value="PHP">PHP — Philippine Peso (₱)</option>
              <option value="USD">USD — US Dollar ($)</option>
              <option value="SGD">SGD — Singapore Dollar (S$)</option>
              <option value="EUR">EUR — Euro (€)</option>
              <option value="JPY">JPY — Japanese Yen (¥)</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">Timezone
            <select value={settings.timezone} onChange={(e) => update("timezone", e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs bg-white">
              <option value="Asia/Manila">Asia/Manila</option>
              <option value="Asia/Singapore">Asia/Singapore</option>
              <option value="Australia/Sydney">Australia/Sydney</option>
              <option value="Europe/London">Europe/London</option>
              <option value="America/New_York">America/New_York</option>
            </select>
          </label>
        </div>

        <div className="mt-5 grid sm:grid-cols-3 gap-2 text-[10px]">
          <div className="rounded-xl bg-slate-50 p-3 flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-indigo-600" /><span>Country: <strong>{settings.country || DEFAULT_COUNTRY}</strong></span></div>
          <div className="rounded-xl bg-slate-50 p-3 flex items-center gap-2"><Globe2 className="w-3.5 h-3.5 text-indigo-600" /><span>Currency: <strong>{settings.currency || DEFAULT_CURRENCY}</strong></span></div>
          <div className="rounded-xl bg-slate-50 p-3 flex items-center gap-2"><Clock3 className="w-3.5 h-3.5 text-indigo-600" /><span>Timezone: <strong>{settings.timezone || DEFAULT_TIMEZONE}</strong></span></div>
        </div>

        <p className="mt-4 inline-flex items-center gap-1.5 text-[10px] text-emerald-700 font-semibold"><Save className="w-3.5 h-3.5" />Saved on this device for the next workspace session.</p>
      </section>
    </div>
  );
};
