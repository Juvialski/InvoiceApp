import { supabase } from "./supabase.ts";
import { BRAND } from "../config/brand.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { assertDeploymentCompanyId } from "./deploymentCompany.ts";
import { requestWithAuthRecovery, SessionExpiredError } from "./authenticatedRequestRecovery.ts";

export interface CompanyApiRequestOptions extends RequestInit {
  /** Compatibility input. It must match the deployment company when supplied. */
  companyId: string;
}

function sessionExpiredMessage(): string {
  return `Your ${BRAND.productName} session has expired. Sign in again.`;
}

/**
 * Send a request to a company-scoped Express endpoint. The browser does not
 * choose the company: the resolved deployment-company context is authoritative.
 * Any mismatched caller-supplied company id fails before a request is sent.
 */
export async function companyApiRequest(path: string, options: CompanyApiRequestOptions) {
  if (!supabase) throw new Error(`Sign in to ${BRAND.productName} before using this service.`);
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new SessionExpiredError(sessionExpiredMessage(), error ?? undefined);
  }

  const deploymentCompanyId = requireActiveCompanyId();
  assertDeploymentCompanyId(deploymentCompanyId, options.companyId, "server request");

  const { companyId: _companyId, ...requestInit } = options;

  return requestWithAuthRecovery({
    initialAccessToken: data.session.access_token,
    sessionExpiredMessage: sessionExpiredMessage(),
    request: async (accessToken) => {
      const headers = new Headers(options.headers || {});
      headers.set("Authorization", `Bearer ${accessToken}`);
      headers.set("X-Company-Id", deploymentCompanyId);
      return fetch(path, { ...requestInit, headers });
    },
    refreshAccessToken: async () => {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session?.access_token) return null;
      return refreshData.session.access_token;
    },
  });
}
