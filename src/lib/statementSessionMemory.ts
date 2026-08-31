/**
 * Transient in-memory store for statement passwords.
 * 
 * SECURITY CONTRACT:
 * - Passwords are NEVER written to localStorage, sessionStorage, IndexedDB, cookies, Supabase, or URLs.
 * - Passwords are NEVER written to logs, console output, analytics, or error objects.
 * - Kept strictly in module-scoped memory during the active browser session.
 * - Cleared automatically on auth sign-out, manual reset, or when an attempted password fails.
 */

import { supabase } from "./supabase.ts";

const transientPasswordCache = new Map<string, string>();

function normalizeScopeKey(key?: string): string {
  return String(key || "default").trim().toLowerCase();
}

/**
 * Retrieves a transient session password for a specific institution or scope if cached.
 */
export function getTransientSessionPassword(scopeKey?: string): string | undefined {
  const key = normalizeScopeKey(scopeKey);
  return transientPasswordCache.get(key) || (key !== "default" ? transientPasswordCache.get("default") : undefined);
}

/**
 * Caches a transient session password in runtime memory only.
 */
export function setTransientSessionPassword(scopeKey: string | undefined, password: string): void {
  if (!password) return;
  const key = normalizeScopeKey(scopeKey);
  transientPasswordCache.set(key, password);
}

/**
 * Purges a cached transient password for a specific institution/scope.
 */
export function clearTransientSessionPassword(scopeKey?: string): void {
  const key = normalizeScopeKey(scopeKey);
  transientPasswordCache.delete(key);
}

/**
 * Purges all transient session passwords from runtime memory.
 */
export function clearAllTransientSessionPasswords(): void {
  transientPasswordCache.clear();
}

/**
 * Returns whether any transient session password is currently held in memory.
 */
export function hasTransientSessionPassword(scopeKey?: string): boolean {
  const key = normalizeScopeKey(scopeKey);
  return transientPasswordCache.has(key) || transientPasswordCache.has("default");
}

// Auto-purge all transient passwords when the user signs out
if (typeof window !== "undefined" && supabase) {
  try {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearAllTransientSessionPasswords();
      }
    });
  } catch {
    // Non-blocking in headless/test environments
  }
}
