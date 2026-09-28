export const THEME_BOOTSTRAP_CSP_HASH = "sha256-MpIxaeCysc2L3COPt53hsVYjrLwqfdNoc+5JB89dL3U=";

function configuredOrigin(value: unknown) {
  try {
    const parsed = new URL(String(value || "").trim());
    return /^https?:$/.test(parsed.protocol) ? parsed.origin : "";
  } catch {
    return "";
  }
}

export function createProductionContentSecurityPolicy(supabaseUrl: unknown) {
  const connectSources = [
    "'self'",
    configuredOrigin(supabaseUrl),
    "https://generativelanguage.googleapis.com",
    "wss:",
  ].filter(Boolean).join(" ");

  return `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self' '${THEME_BOOTSTRAP_CSP_HASH}'; connect-src ${connectSources}`;
}
