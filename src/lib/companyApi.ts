import { supabase } from "./supabase.ts";
import { currentWorkspacePresentation } from "../config/workspacePresentation.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { assertDeploymentCompanyId } from "./deploymentCompany.ts";
import {
  isTerminalSessionRefreshFailure,
  publishSessionExpired,
  requestWithAuthRecovery,
  SessionExpiredError,
  SessionRefreshTemporarilyUnavailableError,
} from "./authenticatedRequestRecovery.ts";

export interface CompanyApiRequestOptions extends RequestInit {
  /** Compatibility input. It must match the deployment company when supplied. */
  companyId: string;
}

function sessionExpiredMessage(): string {
  return `Your ${currentWorkspacePresentation().productName} session has expired. Sign in again.`;
}

/**
 * Send a request to a company-scoped Express endpoint. The browser does not
 * choose the company: the resolved deployment-company context is authoritative.
 * Any mismatched caller-supplied company id fails before a request is sent.
 */
export async function companyApiRequest(path: string, options: CompanyApiRequestOptions) {
  if (!supabase) throw new Error(`Sign in to ${currentWorkspacePresentation().productName} before using this service.`);
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    if (!isTerminalSessionRefreshFailure(error)) throw new SessionRefreshTemporarilyUnavailableError(error);
    if (data.session?.user?.id) publishSessionExpired(data.session.user.id);
    throw new SessionExpiredError(sessionExpiredMessage(), error ?? undefined);
  }
  if (!data.session?.access_token) {
    if (data.session?.user?.id) publishSessionExpired(data.session.user.id);
    throw new SessionExpiredError(sessionExpiredMessage());
  }

  const deploymentCompanyId = requireActiveCompanyId();
  assertDeploymentCompanyId(deploymentCompanyId, options.companyId, "server request");

  const { companyId: _companyId, ...requestInit } = options;

  return requestWithAuthRecovery({
    initialAccessToken: data.session.access_token,
    sessionUserId: data.session.user.id,
    onSessionExpired: () => publishSessionExpired(data.session.user.id),
    sessionExpiredMessage: sessionExpiredMessage(),
    request: async (accessToken) => {
      const headers = new Headers(options.headers || {});
      headers.set("Authorization", `Bearer ${accessToken}`);
      headers.set("X-Company-Id", deploymentCompanyId);
      return fetch(path, { ...requestInit, headers });
    },
    refreshAccessToken: async () => {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      if (!refreshData.session?.access_token || refreshData.session.user.id !== data.session.user.id) return null;
      return refreshData.session.access_token;
    },
  });
}
