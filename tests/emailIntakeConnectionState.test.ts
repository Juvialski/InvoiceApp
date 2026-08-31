import test from "node:test";
import assert from "node:assert/strict";
import { isGmailAuthorizationError, resolveGmailConnectionStatus } from "../src/lib/emailIntake.ts";
import type { GmailConnectionInfo } from "../src/types.ts";

const healthyConnection: GmailConnectionInfo = {
  configured: true,
  signedIn: true,
  hasGmailToken: true,
  email: "finance@company.com",
  lastSyncedAt: "2026-08-30T10:00:00Z",
  lastHistoryId: "123456",
};

test("Email Intake connection state only treats Gmail authorization failures as reconnect-required", () => {
  assert.equal(isGmailAuthorizationError("Gmail authorization expired or was revoked. Reconnect Gmail."), true);
  assert.equal(isGmailAuthorizationError("invalid_grant: token expired"), true);
  assert.equal(isGmailAuthorizationError("Choose a valid custom Gmail date range."), false);
  assert.equal(isGmailAuthorizationError("Connected mailbox request failed."), false);

  assert.equal(
    resolveGmailConnectionStatus(healthyConnection, "Choose a valid custom Gmail date range."),
    "HEALTHY",
  );
  assert.equal(
    resolveGmailConnectionStatus(healthyConnection, "Connected mailbox request failed."),
    "HEALTHY",
  );
  assert.equal(
    resolveGmailConnectionStatus(healthyConnection, "Gmail authorization expired or was revoked. Reconnect Gmail."),
    "RECONNECT_REQUIRED",
  );
});

test("Gmail reconnect lifecycle: captures provider token and transitions from RECONNECT_REQUIRED to HEALTHY", async () => {
  const { captureGoogleProviderTokens, getGoogleProviderToken, clearGoogleProviderTokens } = await import("../src/lib/supabase.ts");

  // Initial state: expired/missing token with previous connection metadata
  clearGoogleProviderTokens();
  const reconnectRequiredConnection: GmailConnectionInfo = {
    configured: true,
    signedIn: true,
    hasGmailToken: Boolean(getGoogleProviderToken()),
    email: "finance@company.com",
    lastSyncedAt: "2026-08-30T10:00:00Z",
    lastHistoryId: "123456",
  };
  assert.equal(
    resolveGmailConnectionStatus(reconnectRequiredConnection, "Gmail authorization expired or was revoked. Reconnect Gmail."),
    "RECONNECT_REQUIRED",
  );

  // Simulated successful OAuth callback returns session with provider_token
  const mockOAuthSession = {
    user: { id: "u-123", email: "finance@company.com" },
    provider_token: "google-access-token-fresh-12345",
  } as any;

  const capturedToken = captureGoogleProviderTokens(mockOAuthSession);
  assert.equal(capturedToken, "google-access-token-fresh-12345");
  assert.equal(getGoogleProviderToken(), "google-access-token-fresh-12345");

  // React state derives new connection object
  const refreshedConnection: GmailConnectionInfo = {
    ...reconnectRequiredConnection,
    hasGmailToken: Boolean(capturedToken || getGoogleProviderToken()),
  };

  // When auth error is cleared upon successful token capture, status becomes HEALTHY
  assert.equal(resolveGmailConnectionStatus(refreshedConnection, null), "HEALTHY");

  // Cleanup
  clearGoogleProviderTokens();
  assert.equal(getGoogleProviderToken(), "");
});
