import type { CompanyAccessSnapshot } from "./companyAccess.ts";

export function shouldPreserveCompanyAccessDuringRefresh(
  access: CompanyAccessSnapshot,
  userId: string,
): boolean {
  return access.status === "ready"
    && access.userId === userId
    && Boolean(access.activeCompanyId);
}

export function isCurrentCompanyAccessRequest(
  currentGeneration: number,
  requestGeneration: number,
  currentUserId: string | null | undefined,
  requestUserId: string,
): boolean {
  return currentGeneration === requestGeneration && currentUserId === requestUserId;
}
