import { supabase } from "./supabase.ts";

const PENDING_EMAIL_REVIEW_KEYS = [
  "engoryx_pending_email_statement_review_v1",
  "engoryx_pending_email_expense_review_v1",
] as const;

function clearPendingReviewKeys() {
  if (typeof window === "undefined") return;
  try {
    for (const key of PENDING_EMAIL_REVIEW_KEYS) window.sessionStorage.removeItem(key);
  } catch {
    // Session storage is optional. If it is inaccessible there is no staged
    // browser state to preserve or clear here.
  }
}

function clearReviewsNotOwnedBy(userId?: string) {
  if (typeof window === "undefined") return;
  try {
    for (const key of PENDING_EMAIL_REVIEW_KEYS) {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { userId?: unknown } | null;
        const ownerId = typeof parsed?.userId === "string" ? parsed.userId : "";
        if (!userId || !ownerId || ownerId !== userId) window.sessionStorage.removeItem(key);
      } catch {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Best effort only when browser session storage is available.
  }
}

// Supabase emits INITIAL_SESSION when persisted auth state is restored. The
// intake module already handles later auth transitions; this bootstrap guard
// prevents staged financial/email data from a prior browser user being exposed
// before another auth event occurs.
if (supabase) {
  try {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "INITIAL_SESSION") return;
      const userId = session?.user?.id;
      if (!userId) clearPendingReviewKeys();
      else clearReviewsNotOwnedBy(userId);
    });
  } catch {
    clearPendingReviewKeys();
  }
}
