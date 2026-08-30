export type AppNavigate = (path: string, replace?: boolean) => void;

/**
 * Navigate within the current browser application without forcing a document
 * reload. Hosts with their own route state should provide AppNavigate; this
 * fallback keeps standalone route components synchronized with popstate too.
 */
export function navigateInApp(path: string, replace = false): void {
  if (typeof window === "undefined") return;
  const nextPath = path.startsWith("/") ? path : `/${path}`;
  const currentPath = `${window.location.pathname}${window.location.search}`;
  if (currentPath === nextPath) return;
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", nextPath);
  window.dispatchEvent(new Event("popstate"));
}
