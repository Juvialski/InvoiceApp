import test from "node:test";
import assert from "node:assert/strict";
import {
  getAuthRedirectUrl,
  isSupabaseConfigured,
  normalizeAuthEmail,
  sendPasswordResetEmail,
  signInWithEmail,
  signUpWithEmail,
  updatePassword,
} from "../src/lib/supabase.ts";

test("normalizes auth email identifiers without touching password values", () => {
  assert.equal(normalizeAuthEmail("  Finance@Example.COM "), "finance@example.com");
  assert.equal(normalizeAuthEmail("User+tag@Example.com"), "user+tag@example.com");
});

test("email helpers fail closed when Supabase is not configured", async () => {
  assert.equal(isSupabaseConfigured, false);
  await assert.rejects(() => signInWithEmail(" user@example.com ", "  P@ss word  "), /Supabase is not configured/);
  await assert.rejects(() => signUpWithEmail(" user@example.com ", "P@ssword"), /Supabase is not configured/);
  await assert.rejects(() => sendPasswordResetEmail(" user@example.com "), /Supabase is not configured/);
  await assert.rejects(() => updatePassword("  P@ssword  "), /Supabase is not configured/);
});

test("auth redirect helper stays safe during server-side tests", () => {
  assert.equal(getAuthRedirectUrl("/reset-password"), undefined);
});
