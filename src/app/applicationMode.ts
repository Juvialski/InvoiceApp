export type ApplicationMode = "production" | "demo" | "workflow-map";

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

export function applicationModeForPath(
  pathname: string | null | undefined,
  search?: string | null,
): ApplicationMode {
  if (isWorkflowMapApplicationPath(pathname, search)) {
    return "workflow-map";
  }
  return isDemoApplicationPath(pathname) ? "demo" : "production";
}

