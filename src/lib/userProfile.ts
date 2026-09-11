import { supabase } from "./supabase.ts";

export interface UserDocumentIdentity {
  displayName: string;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function metadataDisplayName(user: { user_metadata?: Record<string, unknown> | null }) {
  const metadata = user.user_metadata || {};
  return text(metadata.full_name) || text(metadata.name);
}

function requireSupabase() {
  if (!supabase) throw new Error("Authenticated user profiles are unavailable in demo mode.");
  return supabase;
}

export async function loadCurrentUserDocumentIdentity(): Promise<UserDocumentIdentity> {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error("Sign in before loading your document identity.");
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("full_name")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  return { displayName: profile ? text(profile.full_name) : metadataDisplayName(userData.user) };
}

export async function saveCurrentUserDocumentIdentity(displayName: string): Promise<UserDocumentIdentity> {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error("Sign in before saving your document identity.");
  const normalizedName = text(displayName).slice(0, 120);
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .upsert({
      id: userData.user.id,
      email: userData.user.email || null,
      full_name: normalizedName || null,
      avatar_url: text(userData.user.user_metadata?.avatar_url) || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" })
    .select("full_name")
    .single();
  if (profileError) throw profileError;
  return { displayName: text(profile?.full_name) };
}
