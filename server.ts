import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { createAssistantRouter } from "./src/server/assistant/assistantHandler.ts";
import { createAssistantRateLimit } from "./src/server/assistant/assistantRateLimit.ts";
import { createStorageRouter } from "./src/server/storage/storageRouter.ts";
import { createStorageHealthRouter } from "./src/server/storage/storageHealthRouter.ts";
import { createDocumentTemplateRouter } from "./src/server/documentTemplates/documentTemplateRouter.ts";
import { createPublicProspectRouter } from "./src/server/publicProspects/publicProspectRouter.ts";
import { createCompanyAiRouter } from "./src/server/ai/companyAiRouter.ts";
import { createDocumentDeliveryRouter } from "./src/server/documentDelivery/documentDeliveryRouter.ts";
import { createMessagingRouter } from "./src/server/messaging/messagingRouter.ts";
import { createInvoiceExtractionRouter } from "./src/server/invoiceExtraction/invoiceExtractionRouter.ts";
import { createIssuedDocumentRouter } from "./src/server/documentDelivery/issuedDocumentRouter.ts";
import { createManagedDocumentRouter } from "./src/server/managedDocuments/managedDocumentRouter.ts";
import { DOCUMENT_PDF_UNAVAILABLE_MESSAGE, getDocumentPdfFinalizationHealth } from "./src/server/documentTemplates/documentPdfFinalizer.ts";
import { releaseMetadataFromEnv } from "./src/server/releaseMetadata.ts";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

function configuredOrigin(value: unknown) {
  try {
    const parsed = new URL(String(value || "").trim());
    return /^https?:$/.test(parsed.protocol) ? parsed.origin : "";
  } catch {
    return "";
  }
}


app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    const connectSources = [
      "'self'",
      configuredOrigin(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      "https://generativelanguage.googleapis.com",
      "wss:",
    ].filter(Boolean).join(" ");
    res.setHeader("Content-Security-Policy", `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src ${connectSources}`);
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});


app.use("/api/public", createPublicProspectRouter());

// Binary sources are validated before Storage persistence. Keep the global
// JSON ceiling large enough for the documented 10 MB invoice source after
// base64 expansion, while rejecting the previous unrestricted 50 MB envelope.
app.use(express.json({ limit: "16mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));


app.get("/api/health", async (_req, res) => {
  const release = releaseMetadataFromEnv(process.env);
  let documentPdfFinalization;
  try {
    documentPdfFinalization = await getDocumentPdfFinalizationHealth(process.env);
  } catch {
    documentPdfFinalization = { status: "UNAVAILABLE", message: DOCUMENT_PDF_UNAVAILABLE_MESSAGE } as const;
  }
  res.json({
    status: "ok",
    product: "Hydroqualisense",
    timestamp: new Date().toISOString(),
    release,
    documentPdfFinalization,
  });
});



app.use("/api", createCompanyAiRouter());

app.use("/api/assistant", createAssistantRateLimit());
app.use("/api/assistant", createAssistantRouter());
app.use("/api/document-templates", createDocumentTemplateRouter());
app.use("/api/managed-documents", createManagedDocumentRouter());
app.use("/api/documents", createStorageRouter());
app.use("/api", createDocumentDeliveryRouter());
app.use("/api", createMessagingRouter());
app.use("/api", createStorageHealthRouter());
app.use("/api", createInvoiceExtractionRouter());
app.use("/api", createIssuedDocumentRouter());

async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      // Only browser document routes should fall back to the SPA entrypoint.
      // Returning index.html for a mistyped API URL hides the real 404 and can
      // make callers fail later while trying to parse HTML as JSON.
      if (req.path === "/api" || req.path.startsWith("/api/")) {
        res.status(404).json({ success: false, error: "API endpoint not found." });
        return;
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sales Invoice Workspace running at http://0.0.0.0:${PORT}`);
  });
}

start();
