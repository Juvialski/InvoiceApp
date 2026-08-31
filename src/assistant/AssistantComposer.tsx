import React, { useRef, useState } from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { ASSISTANT_ATTACHMENT_ACCEPT } from "./attachmentRouter.ts";
import { useAssistant } from "./AssistantProvider.tsx";
import { prepareAssistantComposerSubmission } from "./assistantComposerState.ts";
import { BRAND } from "../config/brand.ts";

export const AssistantComposer: React.FC = () => {
  const { attachments, addAttachments, removeAttachment, sendMessage, isLoading, canUseAssistant } = useAssistant();
  const [draft, setDraft] = useState("");
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    const submission = prepareAssistantComposerSubmission({
      draft,
      attachmentCount: attachments.length,
      isLoading,
      canUseAssistant,
    });
    if (!submission.accepted) return;
    // Capture the exact submitted text before clearing the controlled field.
    // AssistantProvider snapshots attachments and the request context during
    // this synchronous call; later typing cannot alter this in-flight request.
    if (submission.clearDraft) setDraft("");
    void sendMessage(submission.message);
  };

  const onFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const result = await addAttachments(files);
    setAttachmentError(result.rejected[0]?.message || null);
  };

  return (
    <form data-tour="assistant-composer" aria-label={`${BRAND.assistantName} composer`} aria-busy={isLoading} onSubmit={submit} className="border-t border-slate-200 bg-white p-3 sm:p-4">
      {attachments.length > 0 && <div className="mb-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto" role="list" aria-label="Attached files">{attachments.map((attachment) => <span key={attachment.id} role="listitem" className="inline-flex max-w-full items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-600"><span className="max-w-[12rem] truncate">{attachment.fileName}</span><button type="button" onClick={() => removeAttachment(attachment.id)} className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-700" aria-label={`Remove ${attachment.fileName}`}><X aria-hidden="true" className="h-3 w-3" /></button></span>)}</div>}
      {attachmentError && <p role="alert" aria-live="assertive" className="mb-2 text-[10px] font-semibold leading-4 text-rose-700">{attachmentError}</p>}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-inner focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
        <textarea id="assistant-message-input" value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 8000))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} rows={2} maxLength={8000} placeholder={`Ask ${BRAND.assistantName}...`} aria-label={`Ask ${BRAND.assistantName}`} aria-describedby="assistant-composer-help" className="min-h-[3.25rem] w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400" />
        <div className="flex items-center justify-between gap-2 pt-1">
          <div>
            <input ref={inputRef} type="file" accept={ASSISTANT_ATTACHMENT_ACCEPT} multiple onChange={(event) => void onFilesSelected(event)} aria-label="Choose assistant attachments" className="sr-only" />
            <button type="button" data-tour="assistant-attach" onClick={() => inputRef.current?.click()} disabled={isLoading} className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-500 transition hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"><Paperclip aria-hidden="true" className="h-3.5 w-3.5" /> Attach</button>
          </div>
          <button type="submit" data-tour="assistant-send" disabled={isLoading || (!draft.trim() && attachments.length === 0)} aria-busy={isLoading} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-black text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{isLoading ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Send aria-hidden="true" className="h-3.5 w-3.5" />} {isLoading ? "Working…" : "Send"}</button>
        </div>
      </div>
      <p id="assistant-composer-help" className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs leading-4 text-slate-400"><span>Supported: PDF, JPG, PNG, WEBP, XLSX, CSV, TXT · 10 MB per file</span><span aria-live="polite">{draft.length}/8000</span></p>
    </form>
  );
};
