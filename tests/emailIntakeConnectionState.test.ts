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
