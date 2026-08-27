export type ApplicationMode = "production" | "demo";

function normalizePathname(pathname: string | null | undefined): string {
  const raw = (pathname || "/").split(/[?#]/, 1)[0] || "/";
  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  const normalized = prefixed.replace(/\/{2,}/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
}

export function isDemoApplicationPath(pathname: string | null | undefined): boolean {
  const normalized = normalizePathname(pathname);
  return normalized === "/demo" || normalized.startsWith("/demo/");
}

export function applicationModeForPath(pathname: string | null | undefined): ApplicationMode {
  return isDemoApplicationPath(pathname) ? "demo" : "production";
}
