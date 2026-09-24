import { getActiveCompanyId } from "./companyContext.ts";
import { currentWorkspacePresentation } from "../config/workspacePresentation.ts";
import { createClient, type User } from "@supabase/supabase-js";

const runtimeEnv: Record<string, string | undefined> = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {}) as Record<string, string | undefined>;
const url = (runtimeEnv.VITE_SUPABASE_URL || "").trim();
const publishableKey = (runtimeEnv.VITE_SUPABASE_PUBLISHABLE_KEY || runtimeEnv.VITE_SUPABASE_ANON_KEY || "").trim();

export const isSupabaseConfigured = Boolean(url && publishableKey);

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
  // Remove callback-only provider material left by older releases before the
  // authenticated application can observe or persist it.
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

export async function signInWithGoogle(redirectToPath = "/dashboard") {
  const redirectTo = getAuthRedirectUrl(redirectToPath);
  if (!redirectTo) throw new Error("Google sign-in is only available in a browser.");
  const { error } = await requireSupabase().auth.signInWithOAuth({
    provider: "google",
    options: {
    redirectTo,
      scopes: "openid email profile",
    },
  });
  if (error) throw error;
}

export async function signOutWorkspace() {
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
    throw new Error(`This request cannot target another ${currentWorkspacePresentation().productName} deployment company.`);
  }
  const companyId = deploymentCompanyId;

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Company-Id", companyId);
  const { companyId: _companyId, ...requestInit } = options;
  return fetch(path, { ...requestInit, headers });
}
