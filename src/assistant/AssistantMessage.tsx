import React from "react";
import { AlertTriangle, Bot, FileText, UserRound } from "lucide-react";
import type { AssistantClientAction, AssistantPreparedAction } from "./assistantTypes.ts";
import type { AssistantConversationMessage } from "./assistantUiTypes.ts";
import { AssistantActionCard } from "./AssistantActionCard.tsx";

export interface AssistantMessageProps {
  message: AssistantConversationMessage;
  busy?: boolean;
  onConfirmAction?: (action: AssistantPreparedAction) => void;
  onCancelAction?: (action: AssistantPreparedAction) => void;
  onClientAction?: (action: AssistantClientAction) => void;
}

export const AssistantMessage: React.FC<AssistantMessageProps> = ({ message, busy = false, onConfirmAction, onCancelAction, onClientAction }) => {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  return (
    <article className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`} aria-label={isUser ? "You" : "Invoice Operations AI"}>
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${isUser ? "bg-slate-200 text-slate-600" : isSystem ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>
        {isUser ? <UserRound aria-hidden="true" className="h-3.5 w-3.5" /> : isSystem ? <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" /> : <Bot aria-hidden="true" className="h-3.5 w-3.5" />}
      </div>
      <div className={`min-w-0 max-w-[88%] ${isUser ? "items-end" : "items-start"}`}>
        <div className={`rounded-2xl px-3.5 py-3 text-sm leading-6 ${isUser ? "rounded-tr-md bg-slate-900 text-white" : isSystem ? "rounded-tl-md border border-amber-200 bg-amber-50 text-amber-950" : "rounded-tl-md border border-slate-200 bg-white text-slate-700 shadow-sm"}`}>
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
          {message.warnings.length > 0 && <div className="mt-2 space-y-1.5 border-t border-amber-200/80 pt-2">{message.warnings.map((warning) => <p key={warning} className="flex items-start gap-1.5 text-xs leading-5 text-amber-800"><AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{warning}</p>)}</div>}
          {message.attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">{message.attachments.map((attachment) => <span key={attachment.id} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600"><FileText aria-hidden="true" className="h-3 w-3 shrink-0" /><span className="truncate">{attachment.fileName}</span></span>)}</div>}
        </div>
        {message.references.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{message.references.map((reference) => <span key={`${reference.type}:${reference.id || reference.label}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-500">{reference.label}</span>)}</div>}
        {message.preparedActions.length > 0 && <div className="mt-2 space-y-2">{message.preparedActions.map((action) => <AssistantActionCard key={action.id} preparedAction={action} busy={busy} onConfirm={onConfirmAction} onCancel={onCancelAction} />)}</div>}
        {message.clientActions.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{message.clientActions.map((action, index) => <AssistantActionCard key={`${action.type}:${action.entityId || action.routeId || action.tourId || action.date || index}`} clientAction={action} busy={busy} onClientAction={onClientAction} />)}</div>}
      </div>
    </article>
  );
};
