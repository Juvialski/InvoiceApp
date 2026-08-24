import { supabase } from "./supabase";

export interface CompanyApiRequestOptions extends RequestInit {
  companyId: string;
  googleAccessToken?: string;
}

/**
 * Send a request to a company-scoped Express endpoint.
 *
 * The browser only supplies the current Supabase session and selected company
 * context. The server verifies both; a Google provider token is deliberately
 * carried in its own header and is never used as the InvoiceApp bearer token.
 */
export async function companyApiRequest(path: string, options: CompanyApiRequestOptions) {
  if (!supabase) throw new Error("Sign in to Invoice Operations before using this service.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Your InvoiceApp session has expired. Sign in again.");
  }
  if (!options.companyId) throw new Error("Select a company before continuing.");

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  headers.set("X-Company-Id", options.companyId);
  if (options.googleAccessToken) headers.set("X-Gmail-Access-Token", options.googleAccessToken);

  const { companyId: _companyId, googleAccessToken: _googleAccessToken, ...requestInit } = options;
  return fetch(path, { ...requestInit, headers });
}

