import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type InvitationDeliveryMethod = "invite" | "sign-in";

export class InvitationDeliveryError extends Error {
  readonly code: "NOT_CONFIGURED" | "PROVIDER_REJECTED" | "PROVIDER_UNAVAILABLE";

  constructor(code: InvitationDeliveryError["code"]) {
    super("The invitation email could not be sent.");
    this.name = "InvitationDeliveryError";
    this.code = code;
  }
}

interface InvitationDeliveryEnvironment {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_INVITATION_SERVER_KEY?: string;
  APP_ORIGIN?: string;
  APP_URL?: string;
}

interface InvitationDeliveryClients {
  admin?: SupabaseClient;
  public?: SupabaseClient;
}

export interface InvitationDeliveryInput {
  email: string;
  redirectTo: string;
}

function environmentValue(environment: InvitationDeliveryEnvironment, ...keys: (keyof InvitationDeliveryEnvironment)[]) {
  for (const key of keys) {
    const value = environment[key]?.trim();
    if (value) return value;
  }
  return "";
}

function supabaseUrl(environment: InvitationDeliveryEnvironment) {
  return environmentValue(environment, "SUPABASE_URL", "VITE_SUPABASE_URL");
}

function invitationServerKey(environment: InvitationDeliveryEnvironment) {
  const key = environmentValue(environment, "SUPABASE_INVITATION_SERVER_KEY");
  if (!key || /publishable|anon/i.test(key)) throw new InvitationDeliveryError("NOT_CONFIGURED");
  return key;
}

function publishableKey(environment: InvitationDeliveryEnvironment) {
  const key = environmentValue(environment, "SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY");
  if (!key || /service[_-]?role|secret/i.test(key)) throw new InvitationDeliveryError("NOT_CONFIGURED");
  return key;
}

export function invitationRedirectUrl(environment: InvitationDeliveryEnvironment = process.env): string {
  const configuredOrigin = environmentValue(environment, "APP_ORIGIN", "APP_URL");
  if (!configuredOrigin) throw new InvitationDeliveryError("NOT_CONFIGURED");
  let parsed: URL;
  try {
    parsed = new URL(configuredOrigin);
  } catch {
    throw new InvitationDeliveryError("NOT_CONFIGURED");
  }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new InvitationDeliveryError("NOT_CONFIGURED");
  }
  return new URL("/?auth=invite", parsed.origin).toString();
}

export function createInvitationServerClient(environment: InvitationDeliveryEnvironment = process.env) {
  const url = supabaseUrl(environment);
  if (!url) throw new InvitationDeliveryError("NOT_CONFIGURED");
  return createClient(url, invitationServerKey(environment), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function createPublicClient(environment: InvitationDeliveryEnvironment) {
  const url = supabaseUrl(environment);
  if (!url) throw new InvitationDeliveryError("NOT_CONFIGURED");
  return createClient(url, publishableKey(environment), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function isAlreadyRegisteredError(error: unknown) {
  const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message
    : "";
  return /already\s+(?:been\s+)?registered|already\s+exists|user.*already/i.test(message);
}

/**
 * Send a real Auth email without ever returning or logging the server key.
 * Confirmed users receive a sign-in link as the safe existing-account path;
 * the database invitation still controls whether that session gets membership.
 */
export async function deliverCompanyInvitationEmail(
  input: InvitationDeliveryInput,
  environment: InvitationDeliveryEnvironment = process.env,
  clients: InvitationDeliveryClients = {},
): Promise<{ method: InvitationDeliveryMethod }> {
  const admin = clients.admin || createInvitationServerClient(environment);
  const { error } = await admin.auth.admin.inviteUserByEmail(input.email, { redirectTo: input.redirectTo });
  if (!error) return { method: "invite" };

  if (isAlreadyRegisteredError(error)) {
    const client = clients.public || createPublicClient(environment);
    const fallback = await client.auth.signInWithOtp({
      email: input.email,
      options: { shouldCreateUser: false, emailRedirectTo: input.redirectTo },
    });
    if (!fallback.error) return { method: "sign-in" };
  }

  throw new InvitationDeliveryError(isAlreadyRegisteredError(error) ? "PROVIDER_REJECTED" : "PROVIDER_UNAVAILABLE");
}
