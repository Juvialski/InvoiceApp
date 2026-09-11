import { useEffect, useState } from "react";
import { FileSignature, Save } from "lucide-react";
import { loadCurrentUserDocumentIdentity, saveCurrentUserDocumentIdentity } from "../../lib/userProfile.ts";

export function UserDocumentIdentitySettings() {
  const [savedName, setSavedName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCurrentUserDocumentIdentity().then((identity) => {
      if (cancelled) return;
      setSavedName(identity.displayName);
      setDraftName(identity.displayName);
    }).catch((error) => {
      if (!cancelled) setNotice({ tone: "error", text: error instanceof Error ? error.message : "Your document identity could not be loaded." });
    });
    return () => { cancelled = true; };
  }, []);

  const dirty = draftName.trim() !== savedName.trim();
  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const next = await saveCurrentUserDocumentIdentity(draftName);
      setSavedName(next.displayName);
      setDraftName(next.displayName);
      setNotice({ tone: "success", text: "Document identity saved. New issued documents will use this name in the Prepared by / Processed by line." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Your document identity could not be saved." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="user-document-identity-title" aria-busy={busy}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><FileSignature className="h-5 w-5" /></div>
        <div>
          <p id="user-document-identity-title" className="text-sm font-black text-slate-950">Document identity</p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Choose the human-readable name shown as Prepared by / Processed by. It is separate from your sign-in email.</p>
        </div>
      </div>
      {notice && <p role={notice.tone === "error" ? "alert" : "status"} className={`mt-4 rounded-lg border px-3 py-2 text-xs ${notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.text}</p>}
      <label htmlFor="user-document-display-name" className="mt-5 block text-xs font-bold text-slate-700">
        Prepared by / Processed by name
        <input id="user-document-display-name" value={draftName} disabled={busy} onChange={(event) => setDraftName(event.target.value)} maxLength={120} placeholder="e.g. Maria Santos" className="field-input mt-1.5" />
      </label>
      <p className="mt-2 text-[10px] leading-4 text-slate-500">Leave blank to use the neutral label “Authorized User.” Existing issued snapshots stay immutable; the new name applies to documents issued after saving.</p>
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={() => void save()} disabled={!dirty || busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"><Save className="h-3.5 w-3.5" />{busy ? "Saving…" : "Save document identity"}</button>
      </div>
    </section>
  );
}
