import { getActiveCompanyId } from "./companyContext.ts";
import { createClient, type Session, type User } from "@supabase/supabase-js";

const runtimeEnv: Record<string, string | undefined> = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {}) as Record<string, string | undefined>;
const url = (runtimeEnv.VITE_SUPABASE_URL || "").trim();
const publishableKey = (runtimeEnv.VITE_SUPABASE_PUBLISHABLE_KEY || runtimeEnv.VITE_SUPABASE_ANON_KEY || "").trim();

export const isSupabaseConfigured = Boolean(url && publishableKey);
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

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
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

const ACCESS_TOKEN_KEY = "invoice_ops_google_provider_token";
// Legacy builds persisted a Google refresh token in browser storage even though
// the application never consumes it. Phase 1 removes that credential whenever
// provider tokens are captured or cleared; only the short-lived access token is
// retained for the active connected-mailbox session.
const LEGACY_REFRESH_TOKEN_KEY = "invoice_ops_google_provider_refresh_token";

export function captureGoogleProviderTokens(session: Session | null) {
  const providerToken = (session as any)?.provider_token as string | undefined;
  const storage = browserStorage();
  if (!storage) return;
  storage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  if (providerToken) storage.setItem(ACCESS_TOKEN_KEY, providerToken);
}

export function getGoogleProviderToken() {
  return browserStorage()?.getItem(ACCESS_TOKEN_KEY) || "";
}

export function clearGoogleProviderTokens() {
  const storage = browserStorage();
  if (!storage) return;
  storage.removeItem(ACCESS_TOKEN_KEY);
  storage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

export async function connectGoogleAndGmail() {
  const redirectTo = getAuthRedirectUrl();
  if (!redirectTo) throw new Error("Google sign-in is only available in a browser.");
  const client = requireSupabase();
  const { data: currentUser, error: userError } = await client.auth.getUser();
  if (userError || !currentUser.user) throw new Error("Sign in to Invoice Operations before connecting Gmail.");
  const { error } = await client.auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo,
      scopes: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
      queryParams: {
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
      },
    },
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
  gmailAccessToken?: string | null;
}

function gmailAuthorizationHeader(accessToken: string) {
  const token = accessToken.trim();
  if (!token || /^Bearer\s/i.test(token) || /\s/.test(token)) throw new Error("Gmail authorization is missing or expired. Reconnect Google + Gmail.");
  return `Bearer ${token}`;
}

/**
 * Call an InvoiceApp API route with the Supabase session as Authorization.
 * Google/Gmail credentials use their own header and are never allowed to act
 * as an InvoiceApp session.
 */
export async function fetchCompanyApi(path: string, options: CompanyApiRequestOptions = {}) {
  const token = await getSupabaseAccessToken();
  const deploymentCompanyId = getActiveCompanyId();
  if (!token) throw new Error("Your session is no longer active. Please sign in again.");
  if (!deploymentCompanyId) throw new Error("Resolve deployment access before using this operation.");
  const requestedCompanyId = (options.companyId || "").trim();
  if (requestedCompanyId && requestedCompanyId !== deploymentCompanyId) {
    throw new Error("This request cannot target another Engoryx deployment company.");
  }
  const companyId = deploymentCompanyId;

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Company-Id", companyId);
  if (options.gmailAccessToken) headers.set("X-Gmail-Access-Token", gmailAuthorizationHeader(options.gmailAccessToken));
  const { companyId: _companyId, gmailAccessToken: _gmailAccessToken, ...requestInit } = options;
  return fetch(path, { ...requestInit, headers });
}
