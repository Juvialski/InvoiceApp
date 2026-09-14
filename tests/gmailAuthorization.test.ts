import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyGmailApiError,
  refreshGoogleAccessToken,
  type GmailApiErrorInput,
} from "../src/server/gmail/gmailAuthorization.ts";
import {
  decryptGoogleRefreshToken,
  encryptGoogleRefreshToken,
  readGmailCredentialsMasterKey,
} from "../src/server/gmail/gmailCredentialEncryption.ts";
import { createGmailCredentialRepository } from "../src/server/gmail/gmailProviderCredentials.ts";
import { authorizedGmailRequest } from "../src/server/gmail/gmailAccess.ts";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const TOUCH_FAILURE_USER_ID = "44444444-4444-4444-8444-444444444444";
const MASTER_KEY = Buffer.alloc(32, 7);

function gmailError(status: number, reason: string, message = "provider response") : GmailApiErrorInput {
  return {
    status,
    payload: {
      error: {
        message,
        errors: [{ reason }],
      },
    },
  };
}

test("Gmail provider failures classify expiry, missing scope, permission, and transient quota separately", () => {
  assert.equal(classifyGmailApiError(gmailError(401, "authError")).classification, "ACCESS_TOKEN_EXPIRED");
  assert.equal(classifyGmailApiError(gmailError(403, "insufficientPermissions")).classification, "MISSING_SCOPE");
  assert.equal(classifyGmailApiError(gmailError(403, "rateLimitExceeded")).classification, "TRANSIENT");
  assert.equal(classifyGmailApiError(gmailError(403, "forbidden")).classification, "PERMISSION");
  assert.equal(classifyGmailApiError(gmailError(400, "invalidArgument")).classification, "REQUEST_INVALID");
});

test("Google refresh exchanges a server-held refresh token and accepts provider rotation", async () => {
  let requestBody = "";
  const result = await refreshGoogleAccessToken(
    "refresh-token-value",
    {
      GMAIL_GOOGLE_CLIENT_ID: "client-id",
      GMAIL_GOOGLE_CLIENT_SECRET: "client-secret",
    },
    async (_url, init) => {
      requestBody = String(init?.body || "");
      return new Response(JSON.stringify({ access_token: "fresh-access-token", expires_in: 3600, refresh_token: "rotated-refresh-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );

  assert.equal(result.accessToken, "fresh-access-token");
  assert.equal(result.refreshToken, "rotated-refresh-token");
  assert.match(requestBody, /grant_type=refresh_token/);
  assert.match(requestBody, /refresh_token=refresh-token-value/);
  assert.match(requestBody, /client_id=client-id/);
  assert.match(requestBody, /client_secret=client-secret/);
});

test("invalid_grant requires reauthorization without exposing provider response text", async () => {
  await assert.rejects(
    () => refreshGoogleAccessToken("refresh-token-value", {
      GMAIL_GOOGLE_CLIENT_ID: "client-id",
      GMAIL_GOOGLE_CLIENT_SECRET: "client-secret",
    }, async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "refresh token has been revoked" }), { status: 400 })),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "GMAIL_REAUTH_REQUIRED");
      assert.match(String((error as Error).message), /reconnect|reauthor/i);
      assert.doesNotMatch(String((error as Error).message), /refresh token has been revoked/);
      return true;
    },
  );
});

test("oversized Google credentials fail closed instead of being truncated", async () => {
  await assert.rejects(
    () => refreshGoogleAccessToken("r".repeat(4097), { GMAIL_GOOGLE_CLIENT_ID: "client-id", GMAIL_GOOGLE_CLIENT_SECRET: "client-secret" }, async () => new Response("{}", { status: 200 })),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "GMAIL_REFRESH_TOKEN_INVALID");
      return true;
    },
  );
});

test("Gmail refresh-token envelopes are bound to both company and user", () => {
  const envelope = encryptGoogleRefreshToken("refresh-token-value", COMPANY_ID, USER_ID, MASTER_KEY);
  assert.equal(decryptGoogleRefreshToken(envelope, COMPANY_ID, USER_ID, MASTER_KEY), "refresh-token-value");
  assert.throws(() => decryptGoogleRefreshToken(envelope, COMPANY_ID, "33333333-3333-4333-8333-333333333333", MASTER_KEY), /could not be opened safely/i);
  assert.throws(() => readGmailCredentialsMasterKey({ GMAIL_CREDENTIALS_MASTER_KEY: "not-a-key" }), /configur/i);
});

test("Gmail credential persistence sends only an encrypted envelope and returns safe metadata", async () => {
  let rpcName = "";
  let rpcArgs: Record<string, unknown> = {};
  const repository = createGmailCredentialRepository({
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcName = name;
      rpcArgs = args;
      return {
        data: {
          company_id: COMPANY_ID,
          user_id: USER_ID,
          provider: "google",
          email: "finance@example.com",
          status: "ACTIVE",
          credential_version: 2,
          encryption_version: 1,
          last_refreshed_at: null,
        },
        error: null,
      };
    },
  }, { GMAIL_CREDENTIALS_MASTER_KEY: MASTER_KEY.toString("base64") });

  const result = await repository.store({
    companyId: COMPANY_ID,
    userId: USER_ID,
    email: "finance@example.com",
    scopes: ["gmail.readonly", "gmail.send"],
    refreshToken: "refresh-token-value",
  });

  assert.equal(rpcName, "server_store_gmail_provider_credential");
  assert.equal(rpcArgs.p_company_id, COMPANY_ID);
  assert.equal(rpcArgs.p_user_id, USER_ID);
  assert.equal(rpcArgs.p_email, "finance@example.com");
  assert.match(String(rpcArgs.p_ciphertext), /^[A-Za-z0-9+/]+=*$/);
  assert.doesNotMatch(JSON.stringify(rpcArgs), /refresh-token-value/);
  assert.equal(result.status, "ACTIVE");
  assert.equal("ciphertext" in result, false);
});

test("an expired Gmail access token refreshes once and retries without deleting the credential", async () => {
  let refreshCalls = 0;
  const refreshToken = "refresh-token-value";
  const credential = {
    companyId: COMPANY_ID,
    userId: USER_ID,
    provider: "google" as const,
    email: "finance@example.com",
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
    status: "ACTIVE" as const,
    credentialVersion: 1,
    encryptionVersion: 1,
    envelope: encryptGoogleRefreshToken(refreshToken, COMPANY_ID, USER_ID, MASTER_KEY),
  };
  const repository = {
    load: async () => credential,
    decrypt: () => refreshToken,
    store: async () => credential,
    touch: async () => undefined,
    markStatus: async () => { throw new Error("must not invalidate on access-token expiry"); },
    revoke: async () => null,
  };
  const result = await authorizedGmailRequest(
    { companyId: COMPANY_ID, userId: USER_ID },
    async (accessToken) => {
      if (accessToken === "fresh-access-token-1") {
        const error = Object.assign(new Error("expired"), { status: 401, payload: { error: { errors: [{ reason: "authError" }] } } });
        throw error;
      }
      return { accessToken };
    },
    "profile",
    undefined,
    undefined,
    {
      repository,
      environment: { GMAIL_GOOGLE_CLIENT_ID: "client-id", GMAIL_GOOGLE_CLIENT_SECRET: "client-secret", GMAIL_CREDENTIALS_MASTER_KEY: MASTER_KEY.toString("base64") },
      now: () => 1_000,
      tokenFetch: async () => {
        refreshCalls += 1;
        return new Response(JSON.stringify({ access_token: refreshCalls === 1 ? "fresh-access-token-1" : "fresh-access-token-2", expires_in: 3600 }), { status: 200 });
      },
    },
  );
  assert.deepEqual(result, { accessToken: "fresh-access-token-2" });
  assert.equal(refreshCalls, 2);
});

test("a refresh remains usable when the non-critical metadata touch fails", async () => {
  const credential = {
    companyId: COMPANY_ID,
    userId: TOUCH_FAILURE_USER_ID,
    provider: "google" as const,
    email: "finance@example.com",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
    status: "ACTIVE" as const,
    credentialVersion: 1,
    encryptionVersion: 1,
    envelope: encryptGoogleRefreshToken("refresh-token-value", COMPANY_ID, TOUCH_FAILURE_USER_ID, MASTER_KEY),
  };
  const repository = {
    load: async () => credential,
    decrypt: () => "refresh-token-value",
    store: async () => credential,
    touch: async () => { throw new Error("metadata database unavailable"); },
    markStatus: async () => credential,
    revoke: async () => null,
  };
  const result = await authorizedGmailRequest(
    { companyId: COMPANY_ID, userId: TOUCH_FAILURE_USER_ID },
    async (accessToken) => ({ accessToken }),
    "profile",
    undefined,
    undefined,
    {
      repository,
      environment: { GMAIL_GOOGLE_CLIENT_ID: "client-id", GMAIL_GOOGLE_CLIENT_SECRET: "client-secret", GMAIL_CREDENTIALS_MASTER_KEY: MASTER_KEY.toString("base64") },
      tokenFetch: async () => new Response(JSON.stringify({ access_token: "fresh-access-token", expires_in: 3600 }), { status: 200 }),
    },
  );
  assert.deepEqual(result, { accessToken: "fresh-access-token" });
});

test("a second Gmail 401 after refresh becomes one reconnect-required result", async () => {
  let marked = "";
  const credential = {
    companyId: COMPANY_ID,
    userId: USER_ID,
    provider: "google" as const,
    email: "finance@example.com",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
    status: "ACTIVE" as const,
    credentialVersion: 1,
    encryptionVersion: 1,
    envelope: encryptGoogleRefreshToken("refresh-token-value", COMPANY_ID, USER_ID, MASTER_KEY),
  };
  const repository = {
    load: async () => credential,
    decrypt: () => "refresh-token-value",
    store: async () => credential,
    touch: async () => undefined,
    markStatus: async (_companyId: string, _userId: string, _status: "INVALID" | "REVOKED", reason: string) => { marked = reason; return credential; },
    revoke: async () => null,
  };
  await assert.rejects(
    () => authorizedGmailRequest(
      { companyId: COMPANY_ID, userId: USER_ID },
      async () => { throw Object.assign(new Error("expired"), { status: 401, payload: { error: { errors: [{ reason: "authError" }] } } }); },
      "profile",
      undefined,
      undefined,
      { repository, environment: { GMAIL_GOOGLE_CLIENT_ID: "client-id", GMAIL_GOOGLE_CLIENT_SECRET: "client-secret" }, tokenFetch: async () => new Response(JSON.stringify({ access_token: "fresh", expires_in: 3600 }), { status: 200 }) },
    ),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "GMAIL_REAUTH_REQUIRED");
      assert.equal((error as { reconnectRequired?: boolean }).reconnectRequired, true);
      return true;
    },
  );
  assert.equal(marked, "GMAIL_REAUTH_REQUIRED");
});
