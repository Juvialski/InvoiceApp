import express from "express";
import {
  authorizationErrorMessage,
  authorizationErrorStatus,
  authorizeCompanyRequest,
  authorizePlatformCompanyRequest,
} from "../auth/serverAuthorization.ts";
import {
  bootstrapDeploymentCompanyAiCredential,
  canBootstrapDeploymentCompanyAiCredential,
  disableCompanyAi,
  enableCompanyAi,
  loadCompanyAiConfig,
  loadServerCompanyAiConfig,
  recordServerCompanyAiTest,
  removeCompanyAiCredential,
  storeCompanyAiCredential,
} from "./companyAiCredentials.ts";
import { encryptCompanyGeminiCredential, credentialLast4 } from "./companyAiEncryption.ts";
import { companyAiServerSupabase } from "./companyAiServerSupabase.ts";
import {
  invalidateCompanyAiRuntime,
  resolveCompanyAiRuntimeCapability,
  testCompanyAiConnection,
} from "./companyAiRuntime.ts";
import { CompanyAiError } from "./companyAiTypes.ts";

function companyAiErrorStatus(error: unknown) {
  return error instanceof CompanyAiError ? error.status : authorizationErrorStatus(error);
}

function companyAiErrorMessage(error: unknown, fallback: string) {
  return error instanceof CompanyAiError ? error.message : authorizationErrorMessage(error, fallback);
}

function companyAiErrorDetails(error: unknown) {
  return error instanceof CompanyAiError ? { code: error.code, reference: error.correlationRef } : {};
}

function platformCompanyAiPath(req: express.Request) {
  return String(req.params.companyId || "").trim();
}

export function createCompanyAiRouter() {
  const router = express.Router();
  router.get("/deployment/company-ai", async (req, res) => {
    try {
      const auth = await authorizeCompanyRequest(req, "company.settings.read");
      const serverClient = companyAiServerSupabase();
      const data = await loadServerCompanyAiConfig(serverClient, auth.companyId);
      const runtimeCapability = await resolveCompanyAiRuntimeCapability({ supabase: auth.supabase, credentialSupabase: serverClient, companyId: auth.companyId });
      const bootstrapAuthorized = !data.credentialConfigured || data.status === "INVALID"
        ? await canBootstrapDeploymentCompanyAiCredential(serverClient, auth.companyId, auth.user.id, data)
        : false;
      return res.json({ success: true, data: { ...data, bootstrapAuthorized, runtimeCapability } });
    } catch (error) {
      return res.status(companyAiErrorStatus(error)).json({ success: false, error: companyAiErrorMessage(error, "Deployment AI configuration could not be loaded safely."), ...companyAiErrorDetails(error) });
    }
  });

  router.put("/deployment/company-ai/gemini/bootstrap", async (req, res) => {
    try {
      const auth = await authorizeCompanyRequest(req, "company.settings.manage");
      const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
      if (!apiKey || apiKey.length > 4096) return res.status(400).json({ success: false, error: "A valid Gemini API key is required." });

      // The authenticated initial Company Admin is only an operator identity for
      // this one-time, exact-deployment bootstrap. The server encrypts the key
      // before any Supabase call and never returns or logs the plaintext.
      const serverClient = companyAiServerSupabase();
      const encrypted = encryptCompanyGeminiCredential(apiKey, auth.companyId);
      const stored = await bootstrapDeploymentCompanyAiCredential(serverClient, auth.companyId, auth.user.id, encrypted, credentialLast4(apiKey));
      invalidateCompanyAiRuntime(auth.companyId);

      if (stored.idempotent || req.body?.validate === false) {
        return res.json({ success: true, data: { ...stored, bootstrap: true, validation: "NOT_RUN" } });
      }

      const tested = await testCompanyAiConnection({
        supabase: serverClient,
        companyId: auth.companyId,
        recordTest: (status) => recordServerCompanyAiTest(serverClient, auth.companyId, status),
      });
      invalidateCompanyAiRuntime(auth.companyId);
      const bootstrapAuthorized = tested.metadata.status === "INVALID"
        ? await canBootstrapDeploymentCompanyAiCredential(serverClient, auth.companyId, auth.user.id, tested.metadata)
        : false;
      return res.json({ success: true, data: { ...tested.metadata, bootstrapAuthorized, bootstrap: true, validation: tested.status, ...(tested.errorCode ? { testErrorCode: tested.errorCode } : {}), ...(tested.reference ? { reference: tested.reference } : {}) } });
    } catch (error) {
      return res.status(companyAiErrorStatus(error)).json({ success: false, error: companyAiErrorMessage(error, "The deployment AI credential could not be configured safely."), ...companyAiErrorDetails(error) });
    }
  });

  router.get("/platform/companies/:companyId/ai-config", async (req, res) => {
    try {
      const auth = await authorizePlatformCompanyRequest(req, platformCompanyAiPath(req));
      const data = await loadCompanyAiConfig(auth.supabase, auth.companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return res.status(companyAiErrorStatus(error)).json({ success: false, error: companyAiErrorMessage(error, "AI configuration could not be loaded safely."), ...companyAiErrorDetails(error) });
    }
  });

  router.put("/platform/companies/:companyId/ai-config/gemini", async (req, res) => {
    try {
      const auth = await authorizePlatformCompanyRequest(req, platformCompanyAiPath(req));
      const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
      if (!apiKey || apiKey.length > 4096) return res.status(400).json({ success: false, error: "A valid Gemini API key is required." });
      const encrypted = encryptCompanyGeminiCredential(apiKey, auth.companyId);
      const data = await storeCompanyAiCredential(auth.supabase, auth.companyId, encrypted, credentialLast4(apiKey));
      invalidateCompanyAiRuntime(auth.companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return res.status(companyAiErrorStatus(error)).json({ success: false, error: companyAiErrorMessage(error, "The Gemini credential could not be saved safely."), ...companyAiErrorDetails(error) });
    }
  });

  router.post("/platform/companies/:companyId/ai-config/gemini/test", async (req, res) => {
    try {
      const auth = await authorizePlatformCompanyRequest(req, platformCompanyAiPath(req));
      const result = await testCompanyAiConnection({ supabase: auth.supabase, companyId: auth.companyId });
      // Provider outages, quota limits, and model availability are safe test
      // results, not transport failures. The metadata carries the precise safe
      // status without exposing provider response details.
      return res.json({ success: true, data: { ...result.metadata, testStatus: result.status, ...(result.errorCode ? { testErrorCode: result.errorCode } : {}), ...(result.reference ? { reference: result.reference } : {}) } });
    } catch (error) {
      const status = companyAiErrorStatus(error);
      return res.status(status).json({ success: false, error: companyAiErrorMessage(error, "The Gemini connection test failed safely."), ...companyAiErrorDetails(error) });
    }
  });

  router.post("/platform/companies/:companyId/ai-config/gemini/disable", async (req, res) => {
    try {
      const auth = await authorizePlatformCompanyRequest(req, platformCompanyAiPath(req));
      const data = await disableCompanyAi(auth.supabase, auth.companyId);
      invalidateCompanyAiRuntime(auth.companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return res.status(companyAiErrorStatus(error)).json({ success: false, error: companyAiErrorMessage(error, "AI could not be disabled safely."), ...companyAiErrorDetails(error) });
    }
  });

  router.post("/platform/companies/:companyId/ai-config/gemini/enable", async (req, res) => {
    try {
      const auth = await authorizePlatformCompanyRequest(req, platformCompanyAiPath(req));
      const data = await enableCompanyAi(auth.supabase, auth.companyId);
      invalidateCompanyAiRuntime(auth.companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return res.status(companyAiErrorStatus(error)).json({ success: false, error: companyAiErrorMessage(error, "AI could not be enabled safely."), ...companyAiErrorDetails(error) });
    }
  });

  router.delete("/platform/companies/:companyId/ai-config/gemini", async (req, res) => {
    try {
      const auth = await authorizePlatformCompanyRequest(req, platformCompanyAiPath(req));
      const data = await removeCompanyAiCredential(auth.supabase, auth.companyId);
      invalidateCompanyAiRuntime(auth.companyId);
      return res.json({ success: true, data });
    } catch (error) {
      return res.status(companyAiErrorStatus(error)).json({ success: false, error: companyAiErrorMessage(error, "The Gemini credential could not be removed safely."), ...companyAiErrorDetails(error) });
    }
  });
  return router;
}
