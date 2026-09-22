import React, { useEffect, useId, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";
import { helpTopicPath, type HelpTopicId } from "../../help/helpCatalog.ts";
import { navigateInApp } from "../../utils/clientNavigation.ts";

export interface ContextualHelpProps {
  readonly label: string;
  readonly title: string;
  readonly children: React.ReactNode;
  readonly articleTopicId?: HelpTopicId;
  readonly align?: "start" | "end";
  readonly className?: string;
}

export function ContextualHelp({ label, title, children, articleTopicId, align = "end", className = "" }: ContextualHelpProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLSpanElement>(null);
  const id = useId().replace(/:/g, "");
  const contentId = `contextual-help-${id}`;
  const titleId = `${contentId}-title`;

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const articlePath = articleTopicId ? helpTopicPath(articleTopicId) : undefined;

  return (
    <span ref={containerRef} className={`relative inline-flex align-middle ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-full border border-slate-200 bg-white p-1 text-slate-500 hover:border-indigo-300 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <CircleHelp aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          id={contentId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className={`absolute top-[calc(100%+0.5rem)] z-40 w-[min(22rem,calc(100vw-2rem))] max-h-[min(70vh,24rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-xl shadow-slate-900/10 ${align === "start" ? "left-0" : "right-0"}`}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-sm font-black text-slate-950">{title}</h2>
            <button type="button" aria-label={`Close ${label}`} onClick={() => { setOpen(false); triggerRef.current?.focus(); }} className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 text-xs leading-5 text-slate-600">{children}</div>
          {articlePath && <a href={articlePath} onClick={(event) => { if (typeof window === "undefined") return; event.preventDefault(); navigateInApp(articlePath); }} className="mt-3 inline-flex text-xs font-black text-indigo-700 hover:underline">Read more in Help Center</a>}
        </div>
      )}
    </span>
  );
}
