import React from "react";
import { CircleHelp } from "lucide-react";
import { getDefaultHelpTopic, getHelpTopic, helpTopicPath, type HelpTopicId } from "../../help/helpCatalog.ts";
import { navigateInApp } from "../../utils/clientNavigation.ts";
import { resolveRoute } from "../../utils/routes.ts";

export interface HelpActionProps {
  readonly topicId?: HelpTopicId | null;
  readonly className?: string;
}

export function HelpAction({ topicId, className = "" }: HelpActionProps) {
  if (topicId === null) return null;
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  const routeId = resolveRoute(pathname).routeId;
  const topic = topicId ? getHelpTopic(topicId) : routeId ? getDefaultHelpTopic(routeId) : undefined;
  const path = topic ? helpTopicPath(topic.id) : "/help";
  const label = topic ? `Help with ${topic.title}` : "Open Help Center";

  return (
    <a
      href={path}
      data-ui="page-header-help"
      aria-label={label}
      title={label}
      onClick={(event) => {
        if (typeof window === "undefined") return;
        event.preventDefault();
        navigateInApp(path);
      }}
      className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${className}`}
    >
      <CircleHelp aria-hidden="true" className="h-3.5 w-3.5 text-indigo-600" />
      Help
    </a>
  );
}
