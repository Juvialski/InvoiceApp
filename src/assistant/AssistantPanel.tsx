import React from "react";
import { Bot, ChevronLeft, ChevronRight, CircleAlert, Lightbulb, Loader2, MessageCircle, Sparkles, X } from "lucide-react";
import { getAssistantTour } from "./tourRegistry.ts";
import { AssistantComposer } from "./AssistantComposer.tsx";
import { AssistantMessage } from "./AssistantMessage.tsx";
import { useAssistant } from "./AssistantProvider.tsx";

export const AssistantPanel: React.FC = () => {
  const {
    isOpen,
    open,
    close,
    messages,
    isLoading,
    error,
    clearError,
    pendingActions,
    confirmAction,
    cancelAction,
    executeClientAction,
    sendMessage,
    canUseAssistant,
    activeTour,
    activeTourStepIndex,
    startTour,
    nextTourStep,
    previousTourStep,
    endTour,
  } = useAssistant();
  const tour = activeTour ? getAssistantTour(activeTour) : undefined;
  const tourStep = tour?.steps[activeTourStepIndex];

  if (!isOpen) {
    return <button type="button" data-tour="assistant-launcher" onClick={open} aria-label="Open Invoice Operations AI" title="Open Invoice Operations AI" className="fixed bottom-4 right-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-300 transition hover:-translate-y-0.5 hover:bg-indigo-700 sm:bottom-6 sm:right-6"><Sparkles aria-hidden="true" className="h-5 w-5" /></button>;
  }

  return (
    <>
      <button type="button" aria-label="Close Invoice Operations AI" onClick={close} className="fixed inset-0 z-40 bg-slate-950/25 sm:bg-transparent" />
      <aside data-tour="assistant-panel" role="dialog" aria-modal="true" aria-label="Invoice Operations AI" className="fixed inset-y-0 right-0 z-50 flex h-dvh w-full flex-col border-l border-slate-200 bg-slate-50 shadow-2xl sm:w-[min(100vw,30rem)]">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><Bot aria-hidden="true" className="h-5 w-5" /></div><div className="min-w-0"><p className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Invoice Operations</p><h2 className="truncate text-sm font-black text-slate-950">AI workspace</h2></div></div>
          <button type="button" onClick={close} aria-label="Close assistant" className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"><X aria-hidden="true" className="h-4 w-4" /></button>
        </header>

        {!canUseAssistant && <div className="mx-3 mt-3 flex gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-900 sm:mx-4"><CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><p><strong>Sign in and select a company to ask AI.</strong> The assistant stays available as a local surface in guest mode, but it will not send unauthenticated requests.</p></div>}

        {tour && tourStep && <section className="mx-3 mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3 sm:mx-4" aria-label={`${tour.title} tour`}>
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[0.15em] text-indigo-600">Guided tour · {activeTourStepIndex + 1}/{tour.steps.length}</p><h3 className="mt-1 text-xs font-black text-indigo-950">{tourStep.title}</h3><p className="mt-1 text-[10px] leading-4 text-indigo-900">{tourStep.body}</p></div><button type="button" onClick={endTour} aria-label="End guided tour" className="rounded-lg p-1 text-indigo-500 hover:bg-white"><X aria-hidden="true" className="h-3.5 w-3.5" /></button></div>
          <div className="mt-3 flex items-center justify-between gap-2"><button type="button" onClick={previousTourStep} disabled={activeTourStepIndex === 0} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-indigo-700 hover:bg-white disabled:opacity-40"><ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" /> Back</button><span className="truncate text-[9px] font-semibold text-indigo-500">{tourStep.target}</span><button type="button" onClick={nextTourStep} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-indigo-700">{activeTourStepIndex === tour.steps.length - 1 ? "Done" : "Next"}<ChevronRight aria-hidden="true" className="h-3.5 w-3.5" /></button></div>
        </section>}

        <div data-tour="assistant-message-list" className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
          {messages.length === 0 ? <div data-tour="assistant-quick-start" className="flex min-h-full flex-col justify-center py-8"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700"><MessageCircle aria-hidden="true" className="h-6 w-6" /></div><h3 className="mt-4 text-center text-base font-black text-slate-950">What do you need to move forward?</h3><p className="mx-auto mt-2 max-w-[21rem] text-center text-xs leading-5 text-slate-500">Ask about a current InvoiceApp feature, or use one of these safe starting points.</p><div className="mx-auto mt-5 grid w-full max-w-[25rem] gap-2"><button type="button" onClick={() => void sendMessage("How do I extract and review an invoice?")} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-left text-xs font-bold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50"><span className="flex items-center gap-2"><Lightbulb aria-hidden="true" className="h-4 w-4 text-indigo-500" />Extract and review an invoice</span><ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400" /></button><button type="button" onClick={() => void sendMessage("Where can I see project costs?")} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-left text-xs font-bold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50"><span className="flex items-center gap-2"><Lightbulb aria-hidden="true" className="h-4 w-4 text-indigo-500" />See project costs</span><ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400" /></button><button type="button" onClick={() => void startTour("assistant-basics")} className="flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50 px-3.5 py-3 text-left text-xs font-bold text-indigo-800 transition hover:bg-indigo-100"><span className="flex items-center gap-2"><Sparkles aria-hidden="true" className="h-4 w-4 text-indigo-600" />Take a quick assistant tour</span><ChevronRight aria-hidden="true" className="h-4 w-4 text-indigo-500" /></button></div></div> : <div className="space-y-4">{messages.map((message) => <AssistantMessage key={message.id} message={message} busy={isLoading} onConfirmAction={(action) => void confirmAction(action.id)} onCancelAction={(action) => cancelAction(action.id)} onClientAction={(action) => void executeClientAction(action)} />)}{isLoading && <div className="flex items-center gap-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><Bot aria-hidden="true" className="h-3.5 w-3.5" /></div><div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-500 shadow-sm"><Loader2 aria-hidden="true" className="inline h-3.5 w-3.5 animate-spin" /> <span className="ml-1">Thinking…</span></div></div>}</div>}
        </div>

        {error && <div role="alert" className="mx-3 mb-2 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-800 sm:mx-4"><p>{error}</p><button type="button" onClick={clearError} aria-label="Dismiss assistant error" className="shrink-0 rounded p-0.5 text-rose-500 hover:bg-white"><X aria-hidden="true" className="h-3.5 w-3.5" /></button></div>}
        {pendingActions.length > 0 && <p className="px-4 pb-1 text-right text-[9px] font-semibold text-amber-700">{pendingActions.length} action{pendingActions.length === 1 ? "" : "s"} waiting for confirmation</p>}
        <AssistantComposer />
      </aside>
    </>
  );
};
