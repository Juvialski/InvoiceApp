import { supabase } from "./supabase.ts";
import { BRAND } from "../config/brand.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { assertDeploymentCompanyId } from "./deploymentCompany.ts";

export interface CompanyApiRequestOptions extends RequestInit {
  /** Compatibility input. It must match the deployment company when supplied. */
  companyId: string;
  googleAccessToken?: string;
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
    throw new Error(`Your ${BRAND.productName} session has expired. Sign in again.`);
  }

  const deploymentCompanyId = requireActiveCompanyId();
  assertDeploymentCompanyId(deploymentCompanyId, options.companyId, "server request");

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  headers.set("X-Company-Id", deploymentCompanyId);
  if (options.googleAccessToken) headers.set("X-Gmail-Access-Token", options.googleAccessToken);

  const { companyId: _companyId, googleAccessToken: _googleAccessToken, ...requestInit } = options;
  return fetch(path, { ...requestInit, headers });
}
