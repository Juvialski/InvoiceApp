import { createClient, Session, User } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export const isSupabaseConfigured = Boolean(url && publishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

const ACCESS_TOKEN_KEY = "invoice_ops_google_provider_token";
const REFRESH_TOKEN_KEY = "invoice_ops_google_provider_refresh_token";

export function captureGoogleProviderTokens(session: Session | null) {
  const providerToken = (session as any)?.provider_token as string | undefined;
  const providerRefreshToken = (session as any)?.provider_refresh_token as string | undefined;
  if (providerToken) localStorage.setItem(ACCESS_TOKEN_KEY, providerToken);
  if (providerRefreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, providerRefreshToken);
}

export function getGoogleProviderToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || "";
}

export function clearGoogleProviderTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export async function connectGoogleAndGmail() {
  if (!supabase) throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY first.");
  const redirectTo = window.location.origin;
  const { error } = await supabase.auth.signInWithOAuth({
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

export async function signOutWorkspace() {
  if (!supabase) return;
  clearGoogleProviderTokens();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getWorkspaceUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
