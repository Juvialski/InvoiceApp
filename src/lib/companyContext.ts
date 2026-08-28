let activeCompanyId: string | null = null;
let contextVersion = 0;
const listeners = new Set<(companyId: string | null, version: number) => void>();

function normalizeCompanyId(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

/** Compatibility name used by company-scoped persistence. It is the deployment company, not a selectable tenant. */
export function getActiveCompanyId(): string | null {
  return activeCompanyId;
}

/**
 * Establish or clear the deployment-company context. A non-null company cannot
 * be replaced by another non-null company without first clearing the context,
 * so stale browser state cannot silently retarget persistence.
 */
export function setActiveCompanyId(value: string | null | undefined): string | null {
  const next = normalizeCompanyId(value);
  if (next === activeCompanyId) return activeCompanyId;
  if (activeCompanyId && next && next !== activeCompanyId) {
    throw new Error("Engoryx deployment company context cannot be switched at runtime.");
  }
  activeCompanyId = next;
  contextVersion += 1;
  for (const listener of listeners) listener(activeCompanyId, contextVersion);
  return activeCompanyId;
}

export const setDeploymentCompanyId = setActiveCompanyId;
export const getDeploymentCompanyId = getActiveCompanyId;

export function getCompanyContextVersion() {
  return contextVersion;
}

export function subscribeToCompanyContext(listener: (companyId: string | null, version: number) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function requireActiveCompanyId(): string {
  const companyId = getActiveCompanyId();
  if (!companyId) throw new Error("The Engoryx deployment company is not available for this session.");
  return companyId;
}

export function companyScopedRow<T extends Record<string, unknown>>(row: T): T & { company_id: string } {
  return { ...row, company_id: requireActiveCompanyId() };
}

export function companyStoragePath(...parts: string[]) {
  const companyId = requireActiveCompanyId();
  return ["companies", companyId, ...parts.filter(Boolean)].join("/");
}

export function clearCompanyContext() {
  setActiveCompanyId(null);
}
