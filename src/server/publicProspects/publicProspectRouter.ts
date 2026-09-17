import express from "express";
import { publicSupabaseClient } from "../auth/serverAuthorization.ts";
import { validatePublicProspectSubmission } from "../../lib/publicProspect.ts";

const publicProspectRateLimit = new Map<string, { windowStartedAt: number; count: number }>();
const PUBLIC_PROSPECT_RATE_WINDOW_MS = 15 * 60_000;
const PUBLIC_PROSPECT_RATE_LIMIT = 5;

function publicProspectAddress(req: express.Request) {
  // Express does not trust forwarded headers by default, so a caller cannot
  // choose a different bucket by sending X-Forwarded-For to this process.
  return String(req.ip || req.socket.remoteAddress || "unknown");
}

function allowPublicProspectRequest(req: express.Request) {
  const now = Date.now();
  if (publicProspectRateLimit.size > 10_000) {
    for (const [key, value] of publicProspectRateLimit) {
      if (now - value.windowStartedAt >= PUBLIC_PROSPECT_RATE_WINDOW_MS) publicProspectRateLimit.delete(key);
    }
  }
  const key = publicProspectAddress(req);
  const current = publicProspectRateLimit.get(key);
  const windowStartedAt = current && now - current.windowStartedAt < PUBLIC_PROSPECT_RATE_WINDOW_MS ? current.windowStartedAt : now;
  const count = current && windowStartedAt === current.windowStartedAt ? current.count + 1 : 1;
  publicProspectRateLimit.set(key, { windowStartedAt, count });
  return count <= PUBLIC_PROSPECT_RATE_LIMIT;
}

function parsePublicProspectJson(req: express.Request, res: express.Response, next: express.NextFunction) {
  express.json({ limit: "32kb", strict: true })(req, res, (error: unknown) => {
    if (!error) return next();
    const status = typeof error === "object" && error && "type" in error && (error as { type?: unknown }).type === "entity.too.large" ? 413 : 400;
    return res.status(status).json({ success: false, error: status === 413 ? "The requirements request is too large." : "The requirements request payload is invalid." });
  });
}

export function createPublicProspectRouter() {
  const router = express.Router();
  router.post("/prospects", parsePublicProspectJson, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex");
    if (!allowPublicProspectRequest(req)) {
      res.setHeader("Retry-After", String(Math.ceil(PUBLIC_PROSPECT_RATE_WINDOW_MS / 1000)));
      return res.status(429).json({ success: false, code: "RATE_LIMITED", error: "The public requirements form is temporarily rate limited. Try again later." });
    }

    // A non-empty honeypot is accepted without persistence so automated callers
    // cannot use this endpoint to probe validation or database behavior.
    if (typeof req.body?.website === "string" && req.body.website.trim()) {
      return res.status(202).json({ success: true, data: { accepted: true } });
    }

    const validation = validatePublicProspectSubmission(req.body);
    if (validation.ok === false) return res.status(400).json({ success: false, error: "Please correct the highlighted requirements fields.", fields: validation.fields });

    try {
      const { value } = validation;
      const { data, error } = await publicSupabaseClient().rpc("submit_public_prospect", {
        p_company_name: value.companyName,
        p_contact_name: value.contactName,
        p_contact_email: value.contactEmail,
        p_contact_phone: value.contactPhone,
        p_modules: value.modules,
        p_workforce_scale: value.workforceScale,
        p_project_scale: value.projectScale,
        p_pain_points: value.painPoints,
        p_integration_needs: value.integrationNeeds,
        p_desired_timeline: value.desiredTimeline,
        p_request_type: value.requestType,
        p_consent_confirmed: true,
      });
      if (error || data !== true) return res.status(503).json({ success: false, error: "The public requirements intake is temporarily unavailable. No deployment or account was created." });
      return res.status(201).json({ success: true, data: { accepted: true } });
    } catch {
      return res.status(503).json({ success: false, error: "The public requirements intake is temporarily unavailable. No deployment or account was created." });
    }
  });
  return router;
}
