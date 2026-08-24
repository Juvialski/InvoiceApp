export type CompanyManagementTab = "general" | "members" | "ai" | "activity" | "danger";
export type CompanyManagementResource = "members" | "invitations" | "audit" | "ai";

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
