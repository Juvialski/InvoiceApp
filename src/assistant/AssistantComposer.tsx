import React, { useRef, useState } from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { ASSISTANT_ATTACHMENT_ACCEPT } from "./attachmentRouter.ts";
import { useAssistant } from "./AssistantProvider.tsx";

export const AssistantComposer: React.FC = () => {
  const { attachments, addAttachments, removeAttachment, sendMessage, isLoading } = useAssistant();
  const [draft, setDraft] = useState("");
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (isLoading || (!draft.trim() && attachments.length === 0)) return;
    const sent = await sendMessage(draft);
    if (sent) setDraft("");
  };

  const onFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const result = await addAttachments(files);
    setAttachmentError(result.rejected[0]?.message || null);
  };

  return (
    <form data-tour="assistant-composer" onSubmit={(event) => void submit(event)} className="border-t border-slate-200 bg-white p-3 sm:p-4">
      {attachments.length > 0 && <div className="mb-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">{attachments.map((attachment) => <span key={attachment.id} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-bold text-slate-600"><span className="max-w-[12rem] truncate">{attachment.fileName}</span><button type="button" onClick={() => removeAttachment(attachment.id)} className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-700" aria-label={`Remove ${attachment.fileName}`}><X aria-hidden="true" className="h-3 w-3" /></button></span>)}</div>}
      {attachmentError && <p role="alert" className="mb-2 text-[10px] font-semibold leading-4 text-rose-700">{attachmentError}</p>}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-inner focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 8000))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} rows={2} placeholder="Ask Invoice Operations AI..." aria-label="Ask Invoice Operations AI" className="min-h-[3.25rem] w-full resize-none border-0 bg-transparent px-1 py-1 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400" />
        <div className="flex items-center justify-between gap-2 pt-1">
          <div>
            <input ref={inputRef} type="file" accept={ASSISTANT_ATTACHMENT_ACCEPT} multiple onChange={(event) => void onFilesSelected(event)} className="sr-only" />
            <button type="button" data-tour="assistant-attach" onClick={() => inputRef.current?.click()} disabled={isLoading} className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-500 transition hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"><Paperclip aria-hidden="true" className="h-3.5 w-3.5" /> Attach</button>
          </div>
          <button type="submit" data-tour="assistant-send" disabled={isLoading || (!draft.trim() && attachments.length === 0)} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-black text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{isLoading ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Send aria-hidden="true" className="h-3.5 w-3.5" />} {isLoading ? "Working…" : "Send"}</button>
        </div>
      </div>
      <p className="mt-2 text-xs leading-4 text-slate-400">Supported: PDF, JPG, PNG, WEBP, XLSX, CSV, TXT · 10 MB per file</p>
    </form>
  );
};
