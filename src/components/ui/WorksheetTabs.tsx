import React, { useRef } from "react";

export interface WorksheetTab {
  id: string;
  label: string;
  disabled?: boolean;
  count?: number;
}

export interface WorksheetTabsProps {
  ariaLabel: string;
  tabs: readonly WorksheetTab[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function WorksheetTabs({ ariaLabel, tabs, value, onChange, className = "" }: WorksheetTabsProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusTab = (index: number) => {
    const tab = tabs[index];
    if (!tab || tab.disabled) return;
    tabRefs.current.get(tab.id)?.focus();
    onChange(tab.id);
  };
  const moveTab = (index: number, direction: 1 | -1) => {
    if (!tabs.length) return;
    let nextIndex = index;
    for (let step = 0; step < tabs.length; step += 1) {
      nextIndex = (nextIndex + direction + tabs.length) % tabs.length;
      if (!tabs[nextIndex].disabled) {
        focusTab(nextIndex);
        return;
      }
    }
  };

  return (
    <div role="tablist" aria-label={ariaLabel} aria-orientation="horizontal" className={`flex min-w-0 gap-1 overflow-x-auto border-b border-slate-200 ${className}`}>
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(node) => { if (node) tabRefs.current.set(tab.id, node); else tabRefs.current.delete(tab.id); }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-disabled={tab.disabled || undefined}
            tabIndex={selected ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") { event.preventDefault(); moveTab(index, 1); }
              if (event.key === "ArrowLeft") { event.preventDefault(); moveTab(index, -1); }
              if (event.key === "Home") { event.preventDefault(); focusTab(tabs.findIndex((candidate) => !candidate.disabled)); }
              if (event.key === "End") { event.preventDefault(); focusTab([...tabs].map((candidate, candidateIndex) => ({ candidate, candidateIndex })).reverse().find(({ candidate }) => !candidate.disabled)?.candidateIndex ?? -1); }
            }}
            className={`min-h-10 shrink-0 border-b-2 px-3 py-2 text-xs font-black transition-colors ${selected ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"} disabled:cursor-not-allowed disabled:opacity-45`}
          >
            {tab.label}{tab.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-600">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
