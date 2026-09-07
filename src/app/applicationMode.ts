export type ApplicationMode = "production" | "public" | "demo" | "workflow-map";

function normalizePathname(pathname: string | null | undefined): string {
  const raw = (pathname || "/").split(/[?#]/, 1)[0] || "/";
  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  const normalized = prefixed.replace(/\/{2,}/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
}

export function isWorkflowMapApplicationPath(
  pathname: string | null | undefined,
  search?: string | null,
): boolean {
  const normalized = normalizePathname(pathname);
  if (
    normalized === "/workflow-map" ||
    normalized.startsWith("/workflow-map/") ||
    normalized === "/dev/workflow-map" ||
    normalized.startsWith("/dev/workflow-map/") ||
    normalized === "/dev/architecture" ||
    normalized.startsWith("/dev/architecture/")
  ) {
    return true;
  }
  if (search) {
    const rawSearch = search.startsWith("?") ? search.slice(1) : search;
    const params = new URLSearchParams(rawSearch);
    const view = params.get("view") || params.get("mode") || params.get("tool");
    if (view === "workflow-map" || view === "architecture" || view === "canvas") {
      return true;
    }
  }
  return false;
}

export function isDemoApplicationPath(pathname: string | null | undefined): boolean {
  const normalized = normalizePathname(pathname);
  return normalized === "/demo" || normalized.startsWith("/demo/");
}

export function isPasswordRecoveryPath(
  pathname: string | null | undefined,
  search?: string | null,
  hash?: string | null,
): boolean {
  const normalized = normalizePathname(pathname);
  if (normalized === "/reset-password") return true;
  if (normalized !== "/") return false;
  const query = new URLSearchParams((search || "").replace(/^\?/, ""));
  const hashParams = new URLSearchParams((hash || "").replace(/^#/, ""));
  return query.get("auth") === "reset" || query.get("type") === "recovery" || hashParams.get("type") === "recovery";
}

export function isPublicFunnelApplicationPath(
  pathname: string | null | undefined,
  search?: string | null,
  hash?: string | null,
): boolean {
  const normalized = normalizePathname(pathname);
  if (normalized === "/request-demo" || normalized === "/contact") return true;
  if (normalized !== "/") return false;

  // Password-recovery links historically use /?auth=reset (or a Supabase
  // recovery hash). Keep those links in the authenticated AuthScreen flow.
  return !isPasswordRecoveryPath(normalized, search, hash);
}

function publicFunnelEnabledFromBuildEnv(): boolean {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const value = env?.VITE_HYDROQUALISENSE_PUBLIC_FUNNEL_ENABLED;
  return value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

export function applicationModeForPath(
  pathname: string | null | undefined,
  search?: string | null,
  hash?: string | null,
  publicFunnelEnabled = publicFunnelEnabledFromBuildEnv(),
): ApplicationMode {
  if (isWorkflowMapApplicationPath(pathname, search)) {
    return "workflow-map";
  }
  if (isDemoApplicationPath(pathname)) return "demo";
  return publicFunnelEnabled && isPublicFunnelApplicationPath(pathname, search, hash) ? "public" : "production";
}
