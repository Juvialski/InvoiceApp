let activeCompanyId: string | null = null;
let contextVersion = 0;
const listeners = new Set<(companyId: string | null, version: number) => void>();

function normalizeCompanyId(value: string | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

/** The selected tenant used by all browser-side company data APIs. */
export function getActiveCompanyId(): string | null {
  return activeCompanyId;
}

/**
 * Set or clear the active tenant. Clearing first during a switch makes stale
 * requests fail closed before the next tenant is allowed to load.
 */
export function setActiveCompanyId(value: string | null | undefined): string | null {
  const next = normalizeCompanyId(value);
  if (next === activeCompanyId) return activeCompanyId;
  activeCompanyId = next;
  contextVersion += 1;
  for (const listener of listeners) listener(activeCompanyId, contextVersion);
  return activeCompanyId;
}

export function getCompanyContextVersion() {
  return contextVersion;
}

export function subscribeToCompanyContext(listener: (companyId: string | null, version: number) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function requireActiveCompanyId(): string {
  const companyId = getActiveCompanyId();
  if (!companyId) throw new Error("Select a company before accessing company data.");
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
