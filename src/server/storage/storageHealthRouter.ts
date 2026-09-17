import express from "express";
import { getStorageHealth } from "../../lib/storage/index.ts";
import {
  authorizationErrorMessage,
  authorizationErrorStatus,
  authorizeCompanyRequest,
} from "../auth/serverAuthorization.ts";

export function createStorageHealthRouter() {
  const router = express.Router();
  router.get("/storage/health", async (req, res) => {
    try {
      const auth = await authorizeCompanyRequest(req, "storage.read");
      return res.json({ success: true, data: { companyId: auth.companyId, ...getStorageHealth(process.env) } });
    } catch (error) {
      return res.status(authorizationErrorStatus(error)).json({ success: false, error: authorizationErrorMessage(error, "Storage health is unavailable.") });
    }
  });
  return router;
}
