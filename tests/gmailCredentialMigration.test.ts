import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260914044619_gmail_provider_credentials.sql", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const browserSupabase = readFileSync(new URL("../src/lib/supabase.ts", import.meta.url), "utf8");
const emailIntake = readFileSync(new URL("../src/lib/emailIntake.ts", import.meta.url), "utf8");
const emailDocument = readFileSync(new URL("../src/lib/documentEmail.ts", import.meta.url), "utf8");
const gmailAccess = readFileSync(new URL("../src/server/gmail/gmailAccess.ts", import.meta.url), "utf8");
const gmailRepository = readFileSync(new URL("../src/server/gmail/gmailProviderCredentials.ts", import.meta.url), "utf8");
const accessContext = readFileSync(new URL("../src/context/CompanyAccessContext.tsx", import.meta.url), "utf8");

test("Gmail provider credentials are company/user scoped, encrypted at rest, and server-RPC only", () => {
  assert.match(migration, /create table if not exists public\.gmail_provider_credentials/i);
  assert.match(migration, /company_id uuid not null references public\.companies/i);
  assert.match(migration, /user_id uuid not null references auth\.users/i);
  assert.match(migration, /ciphertext text not null/i);
  assert.match(migration, /auth_tag text not null/i);
  assert.match(migration, /unique \(company_id, user_id, provider\)/i);
  assert.match(migration, /alter table public\.gmail_provider_credentials enable row level security/i);
  assert.match(migration, /revoke all on table public\.gmail_provider_credentials from public, anon, authenticated/i);
  assert.match(migration, /server_get_gmail_provider_credential/i);
  assert.match(migration, /server_store_gmail_provider_credential/i);
  assert.match(migration, /grant execute on function public\.server_get_gmail_provider_credential[\s\S]*to service_role/i);
  assert.match(migration, /revoke all on function public\.server_get_gmail_provider_credential[\s\S]*from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /grant .*gmail_provider_credentials.*authenticated/i);
});

test("Gmail browser calls no longer depend on a provider access token in local storage", () => {
  assert.doesNotMatch(browserSupabase, /setItem\(ACCESS_TOKEN_KEY/);
  assert.match(browserSupabase, /secureAuthStorage/);
  assert.match(browserSupabase, /sanitizePersistedAuthSession/);
  assert.match(browserSupabase, /delete parsed\.provider_refresh_token/);
  assert.match(browserSupabase, /removeLegacyProviderStorage/);
  assert.doesNotMatch(emailIntake, /getGoogleProviderToken\(\)/);
  assert.doesNotMatch(emailDocument, /getGoogleProviderToken\(\)/);
  assert.match(server, /app\.get\("\/api\/gmail\/status"/);
  assert.match(server, /app\.post\("\/api\/gmail\/provider-credential"/);
  assert.match(gmailAccess, /refreshGoogleAccessToken/);
  assert.match(gmailRepository, /SUPABASE_GMAIL_SERVER_KEY/);
  assert.match(gmailRepository, /server_get_gmail_provider_credential/);
  assert.match(accessContext, /provider_refresh_token: undefined/);
  assert.match(accessContext, /setSession\(safeSession\)/);
});
