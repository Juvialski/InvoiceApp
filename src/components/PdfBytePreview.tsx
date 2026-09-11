import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
}

export async function hashPdfBytes(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) return "";
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export interface PdfBytePreviewProps {
  readonly bytes: Uint8Array;
  readonly label: string;
  readonly onHash?: (hash: string) => void;
}

export function PdfBytePreview({ bytes, label, onHash }: PdfBytePreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
    let pdf: pdfjsLib.PDFDocumentProxy | null = null;
    const host = hostRef.current;
    if (!host) return () => { cancelled = true; };
    host.replaceChildren();
    setStatus("loading");
    setError("");
    setPageCount(0);
    void hashPdfBytes(bytes).then((hash) => { if (!cancelled) onHash?.(hash); }).catch(() => { if (!cancelled) onHash?.(""); });

    const render = async () => {
      try {
        loadingTask = pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: true });
        pdf = await loadingTask.promise;
        if (cancelled) return;
        setPageCount(pdf.numPages);
        const availableWidth = Math.max(280, host.clientWidth || 720);
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(1.5, Math.max(0.7, (availableWidth - 4) / baseViewport.width));
          const viewport = page.getViewport({ scale });
          const deviceScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
          const wrapper = document.createElement("div");
          wrapper.dataset.pdfPreviewPage = String(pageNumber);
          wrapper.className = "w-full overflow-hidden rounded-sm bg-white shadow-sm";
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width * deviceScale);
          canvas.height = Math.ceil(viewport.height * deviceScale);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.maxWidth = "100%";
          canvas.style.height = "auto";
          canvas.setAttribute("aria-label", `${label}, page ${pageNumber} of ${pdf.numPages}`);
          wrapper.appendChild(canvas);
          host.appendChild(wrapper);
          await page.render({
            canvasContext: canvas.getContext("2d", { alpha: false })!,
            viewport,
            transform: deviceScale === 1 ? undefined : [deviceScale, 0, 0, deviceScale, 0, 0],
          }).promise;
          page.cleanup();
        }
        if (!cancelled) setStatus("ready");
      } catch (renderError) {
        if (!cancelled) {
          setStatus("error");
          setError(renderError instanceof Error ? renderError.message : "The generated PDF could not be previewed safely.");
        }
      }
    };
    void render();
    return () => {
      cancelled = true;
      host.replaceChildren();
      void loadingTask?.destroy();
      void pdf?.destroy();
    };
  }, [bytes, label, onHash]);

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-2" data-pdf-preview="true" data-pdf-preview-status={status} data-pdf-preview-page-count={pageCount}>
      {status === "loading" && <div role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-xs font-semibold text-slate-500">Rendering the exact PDF bytes…</div>}
      {status === "error" && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-xs text-rose-800">{error || "The generated PDF could not be previewed safely."}</div>}
      <div ref={hostRef} className="space-y-3" aria-label={label} />
    </div>
  );
}

export default PdfBytePreview;
