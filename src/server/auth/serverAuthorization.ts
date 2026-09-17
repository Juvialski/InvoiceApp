import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Request } from "express";

export type CompanyPermission =
  | "invoices.extract"
  | "expenses.manage"
  | "company.settings.read"
  | "company.members.manage"
  | "company.settings.manage"
  | "storage.read"
  | "documents.send"
  | "procurement.read"
  | "projects.read";

export interface CompanyRequestAuthorization {
  accessToken: string;
  companyId: string;
  supabase: SupabaseClient;
  user: User;
}

export class ApiAuthorizationError extends Error {
  status: number;
  code: "UNAUTHENTICATED" | "COMPANY_REQUIRED" | "FORBIDDEN" | "SERVER_AUTH_UNAVAILABLE";

  constructor(
    status: number,
    code: ApiAuthorizationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "ApiAuthorizationError";
    this.code = code;
    this.status = status;
  }
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function firstHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export function requestBearerToken(req: Request) {
  const authorization = firstHeaderValue(req.headers.authorization);
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) {
    throw new ApiAuthorizationError(401, "UNAUTHENTICATED", "A valid Hydroqualisense session is required.");
  }
  return match[1];
}

function serverSupabaseConfiguration() {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const publishableKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || ""
  ).trim();
  if (!supabaseUrl || !publishableKey) {
    throw new ApiAuthorizationError(503, "SERVER_AUTH_UNAVAILABLE", "Company authorization is not configured on the server.");
  }
  if (/service[_-]?role|secret/i.test(publishableKey)) {
    throw new ApiAuthorizationError(503, "SERVER_AUTH_UNAVAILABLE", "Company authorization is not configured on the server.");
  }
  return { supabaseUrl, publishableKey };
}

function requestSupabaseClient(accessToken: string) {
  const { supabaseUrl, publishableKey } = serverSupabaseConfiguration();
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + accessToken } },
  });
}

export function publicSupabaseClient() {
  const { supabaseUrl, publishableKey } = serverSupabaseConfiguration();
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function authorizeCompanyRequest(req: Request, permission: CompanyPermission): Promise<CompanyRequestAuthorization> {
  const accessToken = requestBearerToken(req);
  const client = requestSupabaseClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new ApiAuthorizationError(401, "UNAUTHENTICATED", "A valid Hydroqualisense session is required.");
  }

  const companyId = firstHeaderValue(req.headers["x-company-id"]).trim();
  if (!companyId || !UUID_PATTERN.test(companyId)) {
    throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "A valid company context is required for this operation.");
  }

  const { data: deploymentCompanyId, error: deploymentError } = await client.rpc("get_deployment_company_id");
  if (deploymentError || typeof deploymentCompanyId !== "string" || !UUID_PATTERN.test(deploymentCompanyId)) {
    throw new ApiAuthorizationError(503, "SERVER_AUTH_UNAVAILABLE", "Deployment company authorization is temporarily unavailable.");
  }
  if (deploymentCompanyId !== companyId) {
    throw new ApiAuthorizationError(403, "FORBIDDEN", "This request cannot target another Hydroqualisense deployment company.");
  }

  const { data: allowed, error: permissionError } = await client.rpc("has_company_permission", {
    p_company_id: companyId,
    p_permission_key: permission,
  });
  if (permissionError) {
    // Fail closed when the database authorization function is unavailable or
    // returns an unexpected error. Never fall back to a client role/email.
    throw new ApiAuthorizationError(503, "SERVER_AUTH_UNAVAILABLE", "Company authorization is temporarily unavailable.");
  }
  if (allowed !== true) {
    throw new ApiAuthorizationError(403, "FORBIDDEN", "You do not have permission for this company operation.");
  }

  return { accessToken, companyId, supabase: client, user: data.user };
}

export async function authenticateServerRequest(req: Request) {
  const accessToken = requestBearerToken(req);
  const client = requestSupabaseClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) throw new ApiAuthorizationError(401, "UNAUTHENTICATED", "A valid Hydroqualisense session is required.");
  return { accessToken, supabase: client, user: data.user };
}

export async function authorizePlatformCompanyRequest(req: Request, companyId: string): Promise<CompanyRequestAuthorization> {
  if (!UUID_PATTERN.test(companyId)) throw new ApiAuthorizationError(400, "COMPANY_REQUIRED", "A valid company context is required for this operation.");
  const auth = await authenticateServerRequest(req);
  const headerCompanyId = firstHeaderValue(req.headers["x-company-id"]).trim();
  if (headerCompanyId && (!UUID_PATTERN.test(headerCompanyId) || headerCompanyId !== companyId)) {
    throw new ApiAuthorizationError(403, "FORBIDDEN", "This request cannot target another Hydroqualisense deployment company.");
  }
  const { data: deploymentCompanyId, error: deploymentError } = await auth.supabase.rpc("get_deployment_company_id");
  if (deploymentError || deploymentCompanyId !== companyId) {
    throw new ApiAuthorizationError(deploymentError ? 503 : 403, deploymentError ? "SERVER_AUTH_UNAVAILABLE" : "FORBIDDEN", deploymentError ? "Deployment company authorization is temporarily unavailable." : "Platform maintenance cannot target another Hydroqualisense deployment company.");
  }
  const { data, error } = await auth.supabase.rpc("is_platform_admin");
  if (error) throw new ApiAuthorizationError(503, "SERVER_AUTH_UNAVAILABLE", "Company authorization is temporarily unavailable.");
  if (data !== true) throw new ApiAuthorizationError(403, "FORBIDDEN", "Platform administrator access is required.");
  return { ...auth, companyId };
}

export function authorizationErrorStatus(error: unknown) {
  return error instanceof ApiAuthorizationError ? error.status : 500;
}

export function authorizationErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiAuthorizationError ? error.message : fallback;
}
