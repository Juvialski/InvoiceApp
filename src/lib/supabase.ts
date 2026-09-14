import { getActiveCompanyId } from "./companyContext.ts";
import { BRAND } from "../config/brand.ts";
import { createClient, type Session, type User } from "@supabase/supabase-js";

const runtimeEnv: Record<string, string | undefined> = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {}) as Record<string, string | undefined>;
const url = (runtimeEnv.VITE_SUPABASE_URL || "").trim();
const publishableKey = (runtimeEnv.VITE_SUPABASE_PUBLISHABLE_KEY || runtimeEnv.VITE_SUPABASE_ANON_KEY || "").trim();

export const isSupabaseConfigured = Boolean(url && publishableKey);

// Provider tokens are callback material only. These module captures allow the
// authenticated app to hand a refresh token to the server after company access
// is resolved without putting it in React state or ordinary browser storage.
let memoryProviderToken = "";
let memoryProviderRefreshToken = "";
const LEGACY_PROVIDER_STORAGE_KEYS = ["invoice_ops_google_provider_token", "invoice_ops_google_provider_refresh_token"] as const;

function removeLegacyProviderStorage(storage: Storage) {
  for (const key of LEGACY_PROVIDER_STORAGE_KEYS) storage.removeItem(key);
}

function isSupabaseAuthStorageKey(key: string) {
  return key.startsWith("sb-") && key.endsWith("-auth-token");
}

function sanitizePersistedAuthSession(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.provider_token && typeof parsed.provider_token === "string") memoryProviderToken = parsed.provider_token;
    if (parsed.provider_refresh_token && typeof parsed.provider_refresh_token === "string" && parsed.provider_refresh_token.trim()) memoryProviderRefreshToken = parsed.provider_refresh_token.trim();
    if (!("provider_token" in parsed) && !("provider_refresh_token" in parsed)) return value;
    delete parsed.provider_token;
    delete parsed.provider_refresh_token;
    return JSON.stringify(parsed);
  } catch {
    return value;
  }
}

function secureAuthStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  let storage: Storage;
  try { storage = window.localStorage; } catch { return undefined; }
  removeLegacyProviderStorage(storage);
  // Sanitize an existing Supabase session before any application code can
  // observe it. This also gives the one-time durable migration path a chance
  // to capture a refresh token left by an older client release.
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !isSupabaseAuthStorageKey(key)) continue;
    const value = storage.getItem(key);
    if (value === null) continue;
    const sanitized = sanitizePersistedAuthSession(value);
    if (sanitized !== value) storage.setItem(key, sanitized);
  }
  return {
    get length() { return storage.length; },
    clear: () => storage.clear(),
    key: (index: number) => storage.key(index),
    getItem: (key: string) => {
      const value = storage.getItem(key);
      if (value === null || !isSupabaseAuthStorageKey(key)) return value;
      const sanitized = sanitizePersistedAuthSession(value);
      if (sanitized !== value) storage.setItem(key, sanitized);
      return sanitized;
    },
    removeItem: (key: string) => storage.removeItem(key),
    setItem: (key: string, value: string) => storage.setItem(key, isSupabaseAuthStorageKey(key) ? sanitizePersistedAuthSession(value) : value),
  };
}

function fetchWithCompanyContext(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers || {});
  const companyId = getActiveCompanyId();
  if (companyId) headers.set("X-Company-Id", companyId);
  return fetch(input, { ...init, headers });
}

export const supabase = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        ...(() => {
          const storage = secureAuthStorage();
          return storage ? { storage } : {};
        })(),
      },
      global: { fetch: fetchWithCompanyContext },
    })
  : null;

export interface EmailPasswordCredentials {
  email: string;
  password: string;
}

export interface SignUpOptions {
  emailRedirectTo?: string;
}

export interface PasswordResetRequest {
  email: string;
  redirectTo?: string;
}

export interface PasswordUpdate {
  password: string;
}

const SUPABASE_CONFIGURATION_ERROR = "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY first.";

/** Email addresses are identifiers; passwords must always be passed through unchanged. */
export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase();
}

function requireSupabase() {
  if (!supabase) throw new Error(SUPABASE_CONFIGURATION_ERROR);
  return supabase;
}

/** Build an absolute redirect URL without touching browser globals during SSR/tests. */
export function getAuthRedirectUrl(path = "/") {
  if (typeof window === "undefined") return undefined;
  return new URL(path, window.location.origin).toString();
}

export async function signInWithEmail(input: EmailPasswordCredentials | string, password?: string) {
  const credentials = typeof input === "string" ? { email: input, password: password ?? "" } : input;
  const { email, password: passwordValue } = credentials;
  const { data, error } = await requireSupabase().auth.signInWithPassword({
    email: normalizeAuthEmail(email),
    password: passwordValue,
  });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(input: EmailPasswordCredentials | string, passwordOrOptions?: string | SignUpOptions, maybeOptions: SignUpOptions = {}) {
  const credentials = typeof input === "string" ? { email: input, password: typeof passwordOrOptions === "string" ? passwordOrOptions : "" } : input;
  const options = typeof passwordOrOptions === "object" ? passwordOrOptions : maybeOptions;
  const { email, password } = credentials;
  const { data, error } = await requireSupabase().auth.signUp({
    email: normalizeAuthEmail(email),
    password,
    ...(options.emailRedirectTo ? { options: { emailRedirectTo: options.emailRedirectTo } } : {}),
  });
  if (error) throw error;
  return data;
}

/** Always returns successfully for an accepted request, whether or not the email exists. */
export async function sendPasswordResetEmail(input: PasswordResetRequest | string, redirectTo?: string) {
  const { email, redirectTo: requestedRedirect } = typeof input === "string" ? { email: input, redirectTo } : input;
  const options = requestedRedirect ? { redirectTo: requestedRedirect } : {};
  const { error } = await requireSupabase().auth.resetPasswordForEmail(normalizeAuthEmail(email), options);
  if (error) throw error;
}
export const sendPasswordReset = sendPasswordResetEmail;

export async function updatePassword(input: PasswordUpdate | string) {
  const password = typeof input === "string" ? input : input.password;
  const { data, error } = await requireSupabase().auth.updateUser({ password });
  if (error) throw error;
  return data;
}

// Descriptive aliases keep the auth foundation easy to consume from screens/hooks.
export const requestPasswordReset = sendPasswordResetEmail;
export const updateUserPassword = updatePassword;

export const GOOGLE_PROVIDER_TOKEN_CLEARED_EVENT = "engoryx:google-provider-token-cleared";

export function captureGoogleProviderTokens(session: Session | null): string {
  if (!session) {
    memoryProviderToken = "";
    memoryProviderRefreshToken = "";
    return "";
  }
  const providerToken = (session as any)?.provider_token as string | undefined;
  const providerRefreshToken = (session as any)?.provider_refresh_token as string | undefined;
  if (providerToken) {
    memoryProviderToken = providerToken;
  }
  if (providerRefreshToken && providerRefreshToken.trim()) memoryProviderRefreshToken = providerRefreshToken.trim();
  if (providerToken) return providerToken;
  return memoryProviderToken;
}

export function getGoogleProviderToken() {
  return memoryProviderToken;
}

/** Read callback refresh material from private module memory while it is handed to the server. */
export function getCapturedGoogleProviderRefreshToken() {
  return memoryProviderRefreshToken;
}

export function clearCapturedGoogleProviderRefreshToken() {
  memoryProviderRefreshToken = "";
}

export function clearGoogleProviderTokens() {
  memoryProviderToken = "";
  memoryProviderRefreshToken = "";
  if (typeof window !== "undefined") {
    try { removeLegacyProviderStorage(window.localStorage); } catch { /* storage may be blocked */ }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GOOGLE_PROVIDER_TOKEN_CLEARED_EVENT));
  }
}

export type GoogleGmailConnectionMode = "REAUTHORIZE_LINKED_IDENTITY" | "LINK_IDENTITY";

/**
 * Supabase returns provider_token from a normal OAuth sign-in callback, but not
 * from linkIdentity(). Once Google is already linked, reconnect must therefore
 * reauthorize that linked identity instead of attempting to link it again.
 */
export function resolveGoogleGmailConnectionMode(identities: readonly { provider?: string | null }[]): GoogleGmailConnectionMode {
  return identities.some((identity) => String(identity.provider || "").toLowerCase() === "google")
    ? "REAUTHORIZE_LINKED_IDENTITY"
    : "LINK_IDENTITY";
}

// Keep the existing allow-listed callback target while the legacy path is
// supported as an alias for the Email / SMS workspace.
export async function connectGoogleAndGmail(redirectToPath = "/email-sms?view=inbox") {
  const redirectTo = getAuthRedirectUrl(redirectToPath);
  if (!redirectTo) throw new Error("Google sign-in is only available in a browser.");
  const client = requireSupabase();
  const [{ data: currentUser, error: userError }, { data: identityData, error: identityError }] = await Promise.all([
    client.auth.getUser(),
    client.auth.getUserIdentities(),
  ]);
  if (userError || !currentUser.user) throw new Error("Sign in to Invoice Operations before connecting Gmail.");
  if (identityError) throw identityError;

  const identities = identityData?.identities || [];
  const linkedGoogleIdentity = identities.find((identity) => String(identity.provider || "").toLowerCase() === "google");
  const connectionMode = resolveGoogleGmailConnectionMode(identities);
  const linkedGoogleEmail = typeof linkedGoogleIdentity?.identity_data?.email === "string"
    ? linkedGoogleIdentity.identity_data.email.trim()
    : "";
  const loginHint = linkedGoogleEmail || currentUser.user.email || "";
  const options = {
    redirectTo,
    // Intake still reads through Gmail, while document sending needs the
    // minimum additional Gmail permission. Reconnect/re-consent is explicit
    // because Supabase will not silently upgrade an existing identity.
    scopes: "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
    queryParams: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      ...(loginHint ? { login_hint: loginHint } : {}),
    },
  };

  if (connectionMode === "REAUTHORIZE_LINKED_IDENTITY") {
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options,
    });
    if (error) throw error;
    return;
  }

  const { error } = await client.auth.linkIdentity({
    provider: "google",
    options,
  });
  if (error) throw error;
}

export const signInWithGoogle = connectGoogleAndGmail;

export async function signOutWorkspace() {
  clearGoogleProviderTokens();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export const signOut = signOutWorkspace;
export const signOutUser = signOutWorkspace;

export async function getWorkspaceUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/** Return the Supabase bearer token for authenticated first-party API calls. */
export async function getSupabaseAccessToken() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token || null;
}

export interface CompanyApiRequestOptions extends RequestInit {
  companyId?: string | null;
}

/** Call an InvoiceApp API route with the Supabase session as Authorization. */
export async function fetchCompanyApi(path: string, options: CompanyApiRequestOptions = {}) {
  const token = await getSupabaseAccessToken();
  const deploymentCompanyId = getActiveCompanyId();
  if (!token) throw new Error("Your session is no longer active. Please sign in again.");
  if (!deploymentCompanyId) throw new Error("Resolve deployment access before using this operation.");
  const requestedCompanyId = (options.companyId || "").trim();
  if (requestedCompanyId && requestedCompanyId !== deploymentCompanyId) {
    throw new Error(`This request cannot target another ${BRAND.productName} deployment company.`);
  }
  const companyId = deploymentCompanyId;

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Company-Id", companyId);
  const { companyId: _companyId, ...requestInit } = options;
  return fetch(path, { ...requestInit, headers });
}
