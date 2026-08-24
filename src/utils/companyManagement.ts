export type CompanyManagementTab = "general" | "members" | "ai" | "activity" | "danger";
export type CompanyManagementResource = "members" | "invitations" | "audit" | "ai";

const COMPANY_MANAGEMENT_TABS: readonly CompanyManagementTab[] = ["general", "members", "ai", "activity", "danger"];

export function isCompanyManagementTab(value: unknown): value is CompanyManagementTab {
  return typeof value === "string" && COMPANY_MANAGEMENT_TABS.includes(value as CompanyManagementTab);
}

export function companyManagementTabFromQuery(value: unknown): CompanyManagementTab {
  return isCompanyManagementTab(value) ? value : "general";
}

export interface CompanyManagementRequestIdentity {
  companyId: string;
  generation: number;
}

export function managementResourcesForTab(tab: CompanyManagementTab): readonly CompanyManagementResource[] {
  if (tab === "members") return ["members", "invitations"];
  if (tab === "ai") return ["ai"];
  if (tab === "activity") return ["audit"];
  return [];
}

export function isCurrentManagementRequest(request: CompanyManagementRequestIdentity, current: CompanyManagementRequestIdentity) {
  return request.companyId === current.companyId && request.generation === current.generation;
}
