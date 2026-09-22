import React from "react";
import { SectionHeader } from "./OperationsUI.tsx";
import { useThemePreference } from "../../ui/HydroqualisenseThemeProvider.tsx";
import type { ThemePreference } from "../../ui/themePreference.ts";

const OPTIONS: readonly { value: ThemePreference; label: string; description: string }[] = [
  { value: "system", label: "System", description: "Follow the device appearance." },
  { value: "light", label: "Light", description: "Use the light workspace palette." },
  { value: "dark", label: "Dark", description: "Use the dark workspace palette." },
];

export function ThemePreferenceSettings(): React.JSX.Element {
  const { preference, setPreference } = useThemePreference();
  return (
    <section className="hqs-surface-raised rounded-xl p-4 sm:p-5" aria-labelledby="theme-preference-title">
      <SectionHeader
        title="Appearance"
        description="Choose how this browser presents the workspace. This does not change company settings or access."
      />
      <fieldset className="mt-4">
        <legend id="theme-preference-title" className="sr-only">Theme preference</legend>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Theme preference">
          {OPTIONS.map((option) => (
            <label key={option.value} className="hqs-choice hqs-focus-ring flex cursor-pointer gap-3 rounded-lg p-3">
              <input
                type="radio"
                name="theme-preference"
                value={option.value}
                checked={preference === option.value}
                onChange={() => setPreference(option.value)}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="hqs-primary-text block text-sm font-bold">{option.label}</span>
                <span className="hqs-secondary-text mt-0.5 block text-xs leading-5">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
