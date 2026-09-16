import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Google sign-in uses identity scopes and never requests Gmail access", () => {
  const supabase = source("src/lib/supabase.ts");
  const start = supabase.indexOf("export async function signInWithGoogle");
  const end = supabase.indexOf("export async function signOutWorkspace");
  assert.ok(start >= 0, "the identity-only Google sign-in function should exist");
  const signIn = supabase.slice(start, end >= 0 ? end : undefined);
  assert.match(signIn, /provider:\s*["']google["']/);
  assert.match(signIn, /scopes:\s*["']openid email profile["']/);
  assert.doesNotMatch(signIn, /gmail\.readonly|gmail\.send|gmail\.modify|gmail\.compose|mail\.google\.com/i);
  assert.doesNotMatch(signIn, /access_type|prompt:\s*["']consent|linkIdentity/);
});

test("Google sign-in does not retain callback provider tokens in the authenticated app", () => {
  const supabase = source("src/lib/supabase.ts");
  const access = source("src/context/CompanyAccessContext.tsx");
  const app = source("src/App.tsx");
  assert.doesNotMatch(supabase, /captureGoogleProviderTokens|getCapturedGoogleProviderRefreshToken|persistGoogleProviderCredential/);
  assert.doesNotMatch(access, /captureGoogleProviderTokens|persistGoogleProviderCredential/);
  assert.doesNotMatch(app, /getGoogleProviderRefreshToken|persistGoogleProviderCredential|connectGoogleAndGmail/);
});

test("email and password authentication remains present beside the Google option", () => {
  const auth = source("src/components/auth/AuthScreen.tsx");
  assert.match(auth, /Continue with Google/);
  assert.match(auth, /signInWithEmail/);
  assert.match(auth, /Forgot password\?/);
  assert.match(auth, /Create an account/);
});

test("company access remains resolved separately from Google identity authentication", () => {
  const access = source("src/context/CompanyAccessContext.tsx");
  assert.match(access, /loadCompanyAccess\(supabase\)/);
  assert.match(access, /loadDeploymentCompanyId\(supabase\)/);
  assert.match(access, /resolveDeploymentCompanyAccess\(loaded, deploymentCompanyId\)/);
  assert.doesNotMatch(access, /companyId.*=.*google|google.*companyId/i);
});
