import React, { useRef, useState } from "react";
import { AlertCircle, FileText, Loader2, Sparkles, UploadCloud, Zap } from "lucide-react";
import { SAMPLE_INVOICES } from "../data/sampleInvoices";
import { InvoiceData } from "../types";

export interface ExtractPayload {
  fileData?: string;
  mimeType?: string;
  textData?: string;
  fileName?: string;
  previewUrl?: string;
  model?: string;
  sourceType?: "UPLOAD" | "PASTED_TEXT";
}

interface UploadZoneProps {
  onExtract: (payload: ExtractPayload) => Promise<void>;
  onLoadPreset: (invoice: InvoiceData) => void;
  isLoading: boolean;
}

function fileToPayload(file: File, model: string): Promise<ExtractPayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({
        fileData: result.split(",")[1],
        mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png"),
        fileName: file.name,
        previewUrl: file.type.startsWith("image/") ? result : undefined,
        model,
        sourceType: "UPLOAD",
      });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onExtract, onLoadPreset, isLoading }) => {
  const [dragOver, setDragOver] = useState(false);
  const [inputMode, setInputMode] = useState<"file" | "text">("file");
  const [textInput, setTextInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-3.5-flash-lite");
  const [queue, setQueue] = useState<Array<{ name: string; status: "queued" | "done" | "failed" }>>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files: File[]) => {
    setError(null);
    const valid = files.filter((file) => file.type === "application/pdf" || file.type.startsWith("image/") || /\.(pdf|png|jpe?g|webp)$/i.test(file.name));
    if (!valid.length) {
      setError("Choose PDF, PNG, JPG, JPEG or WEBP invoice files.");
      return;
    }
    setQueue(valid.map((file) => ({ name: file.name, status: "queued" })));
    for (let index = 0; index < valid.length; index += 1) {
      const file = valid[index];
      try {
        const payload = await fileToPayload(file, selectedModel);
        await onExtract(payload);
        setQueue((current) => current.map((item, i) => i === index ? { ...item, status: "done" } : item));
      } catch (e: any) {
        setQueue((current) => current.map((item, i) => i === index ? { ...item, status: "failed" } : item));
        setError(e?.message || `Failed to process ${file.name}`);
      }
    }
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) {
      setError("Paste invoice text first.");
      return;
    }
    await onExtract({ textData: textInput.trim(), fileName: "Pasted-Invoice-Text", model: selectedModel, sourceType: "PASTED_TEXT" });
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div><h2 className="text-base font-black">Extract invoice documents</h2><p className="text-xs text-slate-500 mt-1">Upload one invoice or a full batch. Each document is extracted independently.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs"><Sparkles className="w-3.5 h-3.5 text-indigo-600" /><select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="bg-transparent outline-none font-bold text-indigo-700"><option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite</option><option value="gemini-3.7-flash">Gemini 3.7 Flash</option></select></label>
            <div className="flex bg-slate-100 p-1 rounded-xl"><button onClick={() => setInputMode("file")} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${inputMode === "file" ? "bg-white shadow-sm" : "text-slate-500"}`}>Files</button><button onClick={() => setInputMode("text")} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${inputMode === "text" ? "bg-white shadow-sm" : "text-slate-500"}`}>Paste text</button></div>
          </div>
        </div>

        {inputMode === "file" ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); void processFiles(Array.from(e.dataTransfer.files || [])); }}
            onClick={() => fileInputRef.current?.click()}
            className={`mt-5 rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center cursor-pointer transition ${dragOver ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-300 bg-slate-50/50"}`}
          >
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf" className="hidden" onChange={(e) => void processFiles(Array.from(e.target.files || []))} />
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mx-auto shadow-sm"><UploadCloud className="w-6 h-6 text-indigo-600" /></div>
            <p className="text-sm font-bold mt-4">Drop invoice files here or tap to browse</p>
            <p className="text-xs text-slate-500 mt-1">PDF and image batches supported • processed one-by-one so one bad file does not stop the rest</p>
          </div>
        ) : (
          <form onSubmit={handleTextSubmit} className="mt-5 space-y-3"><textarea value={textInput} onChange={(e) => setTextInput(e.target.value)} rows={11} placeholder="Paste raw invoice text here..." className="w-full rounded-2xl border border-slate-200 p-4 text-xs outline-none resize-y focus:ring-2 focus:ring-indigo-100" /><button disabled={isLoading} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-50">{isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Extract pasted text</button></form>
        )}

        {error && <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
        {queue.length > 0 && <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{queue.map((item) => <div key={item.name} className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-white"><FileText className="w-3.5 h-3.5 text-slate-400" /><span className="text-[10px] font-semibold truncate flex-1">{item.name}</span><span className={`text-[9px] font-black uppercase ${item.status === "done" ? "text-emerald-700" : item.status === "failed" ? "text-rose-700" : "text-amber-700"}`}>{item.status}</span></div>)}</div>}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold">Sample invoices</h3><p className="text-[10px] text-slate-500">Load realistic demo data without using an API call.</p></div><span className="text-[9px] font-bold uppercase text-slate-400">Local presets</span></div>
        <div className="grid md:grid-cols-2 gap-2 mt-4">{SAMPLE_INVOICES.map((preset) => <button key={preset.id} onClick={() => onLoadPreset(preset.previewData)} className="text-left p-3 rounded-xl border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/30 transition"><p className="text-xs font-bold">{preset.name}</p><p className="text-[10px] text-slate-500 mt-1">{preset.description}</p></button>)}</div>
      </div>
    </div>
  );
};
