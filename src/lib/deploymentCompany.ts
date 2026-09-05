import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyAccessSnapshot } from "./companyAccess.ts";
import { supabase } from "./supabase.ts";
import { BRAND } from "../config/brand.ts";

export const DEPLOYMENT_COMPANY_RPC = "get_deployment_company_id";

function normalizedCompanyId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function assertDeploymentCompanyId(
  deploymentCompanyId: string | null | undefined,
  candidateCompanyId?: string | null,
  operation = "company operation",
) {
  const deploymentId = normalizedCompanyId(deploymentCompanyId);
  if (!deploymentId) {
    throw new Error(`This ${BRAND.productName} deployment does not have a configured company.`);
  }
  const candidateId = normalizedCompanyId(candidateCompanyId);
  if (candidateId && candidateId !== deploymentId) {
    throw new Error(`The ${operation} cannot target a company outside this ${BRAND.productName} deployment.`);
  }
  return deploymentId;
}

export async function loadDeploymentCompanyId(client: SupabaseClient | null = supabase) {
  if (!client) throw new Error("Supabase is not configured.");
  const { data, error } = await client.rpc(DEPLOYMENT_COMPANY_RPC);
  if (error) throw error;
  const deploymentCompanyId = normalizedCompanyId(data);
  if (!deploymentCompanyId) {
    throw new Error(`This ${BRAND.productName} deployment does not have a configured company.`);
  }
  return deploymentCompanyId;
}

export function resolveDeploymentCompanyAccess(
  snapshot: CompanyAccessSnapshot,
  deploymentCompanyId: string,
): CompanyAccessSnapshot {
  const companyId = assertDeploymentCompanyId(deploymentCompanyId);
  const company = snapshot.companies.find((item) => item.id === companyId);
  if (!company) {
    throw new Error("The configured deployment company is not available to this authenticated session.");
  }

  const memberships = snapshot.memberships.filter((item) => item.companyId === companyId);
  if (memberships.length > 1) {
    throw new Error("Duplicate deployment-company memberships were returned for this user.");
  }
  const membership = memberships[0] || null;
  const companyActive = company.status.toUpperCase() === "ACTIVE";
  const membershipActive = membership?.status.toUpperCase() === "ACTIVE";
  const status = !companyActive
    ? "company-suspended"
    : membershipActive
      ? "ready"
      : "no-company";

  return {
    ...snapshot,
    status,
    isPlatformOwner: false,
    companies: [company],
    memberships: membership ? [membership] : [],
    activeCompanyId: status === "ready" ? companyId : null,
    permissions: status === "ready" && membership ? [...membership.permissions] : [],
    error: undefined,
  };
}
