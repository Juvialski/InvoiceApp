import { supabase } from "./supabase.ts";

export interface DeploymentCompanyProfilePatch {
  name: string;
  defaultCurrency: string;
  timezone: string;
}

export interface DeploymentCompanyProfile {
  id: string;
  name: string;
  defaultCurrency?: string;
  timezone?: string;
  updatedAt?: string;
}

export interface CompanyProfileRpcClient {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}

function profileFromRecord(value: unknown): DeploymentCompanyProfile {
  if (!value || typeof value !== "object") throw new Error("Company profile update returned no company record.");
  const row = value as Record<string, unknown>;
  const id = String(row.id || "");
  const name = String(row.name || "");
  if (!id || !name) throw new Error("Company profile update returned an invalid company record.");
  return {
    id,
    name,
    defaultCurrency: row.default_currency ? String(row.default_currency) : undefined,
    timezone: row.timezone ? String(row.timezone) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

/**
 * Update the one company configured for this deployment through the
 * membership-authorized profile RPC. The legacy company_code is intentionally
 * not part of this browser-facing contract.
 */
export async function updateDeploymentCompanyProfile(
  expectedCompanyId: string,
  patch: DeploymentCompanyProfilePatch,
  client?: CompanyProfileRpcClient,
): Promise<DeploymentCompanyProfile> {
  const rpcClient = client || (supabase as unknown as CompanyProfileRpcClient | null);
  if (!rpcClient) throw new Error("Supabase is not configured.");

  const { data, error } = await rpcClient.rpc("update_company", {
    p_company_id: expectedCompanyId,
    p_name: patch.name.trim(),
    p_default_currency: patch.defaultCurrency.trim().toUpperCase(),
    p_timezone: patch.timezone.trim(),
  });
  if (error) throw error;

  const record = Array.isArray(data) ? data[0] : data;
  const profile = profileFromRecord(record);
  if (profile.id !== expectedCompanyId) {
    throw new Error("Company profile update returned a different deployment company.");
  }
  return profile;
}
