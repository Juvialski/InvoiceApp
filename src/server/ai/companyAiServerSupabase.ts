import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CompanyAiError } from "./companyAiTypes.ts";

/**
 * The AI envelope resolver is the only server path that needs a privileged
 * Supabase client. Keep this client private to src/server/ai and never expose
 * its key through Vite, browser state, or general persistence modules.
 */
export function companyAiServerSupabase(environment: NodeJS.ProcessEnv = process.env): SupabaseClient {
  const url = (environment.SUPABASE_URL || environment.VITE_SUPABASE_URL || "").trim();
  const serverKey = environment.SUPABASE_AI_SERVER_KEY?.trim();
  if (!url || !serverKey) {
    throw new CompanyAiError("AI_CREDENTIALS_SERVER_MISCONFIGURED", "AI backend configuration is incomplete.", 503);
  }
  return createClient(url, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
