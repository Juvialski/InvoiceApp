import test from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_EXPIRED_ERROR_CODE,
  SessionExpiredError,
  requestWithAuthRecovery,
} from "../src/lib/authenticatedRequestRecovery.ts";

function response(status: number): Response {
  return new Response(null, { status });
}

test("retries once with the refreshed access token after a 401", async () => {
  const tokens: string[] = [];
  let refreshCount = 0;

  const result = await requestWithAuthRecovery({
    initialAccessToken: "stale-token",
    request: async (accessToken) => {
      tokens.push(accessToken);
      return response(tokens.length === 1 ? 401 : 200);
    },
    refreshAccessToken: async () => {
      refreshCount += 1;
      return "fresh-token";
    },
    sessionExpiredMessage: "Session expired",
  });

  assert.equal(result.status, 200);
  assert.deepEqual(tokens, ["stale-token", "fresh-token"]);
  assert.equal(refreshCount, 1);
});

test("turns a failed refresh into a stable session-expired error without retrying", async () => {
  let requestCount = 0;

  await assert.rejects(
    requestWithAuthRecovery({
      initialAccessToken: "stale-token",
      request: async () => {
        requestCount += 1;
        return response(401);
      },
      refreshAccessToken: async () => null,
      sessionExpiredMessage: "Session expired",
    }),
    (error: unknown) => {
      assert.ok(error instanceof SessionExpiredError);
      assert.equal(error.code, SESSION_EXPIRED_ERROR_CODE);
      assert.equal(error.message, "Session expired");
      return true;
    },
  );

  assert.equal(requestCount, 1);
});

test("stops after one retry when the refreshed token is also rejected", async () => {
  let requestCount = 0;
  let refreshCount = 0;

  await assert.rejects(
    requestWithAuthRecovery({
      initialAccessToken: "stale-token",
      request: async () => {
        requestCount += 1;
        return response(401);
      },
      refreshAccessToken: async () => {
        refreshCount += 1;
        return "fresh-token";
      },
      sessionExpiredMessage: "Session expired",
    }),
    SessionExpiredError,
  );

  assert.equal(requestCount, 2);
  assert.equal(refreshCount, 1);
});

test("does not refresh or retry permission failures", async () => {
  let requestCount = 0;
  let refreshCount = 0;

  const result = await requestWithAuthRecovery({
    initialAccessToken: "current-token",
    request: async () => {
      requestCount += 1;
      return response(403);
    },
    refreshAccessToken: async () => {
      refreshCount += 1;
      return "unused-token";
    },
    sessionExpiredMessage: "Session expired",
  });

  assert.equal(result.status, 403);
  assert.equal(requestCount, 1);
  assert.equal(refreshCount, 0);
});

test("a mutation request is retried at most once", async () => {
  const attempts: Array<{ token: string; body: string }> = [];
  const body = JSON.stringify({ subject: "test" });

  const result = await requestWithAuthRecovery({
    initialAccessToken: "stale-token",
    request: async (accessToken) => {
      attempts.push({ token: accessToken, body });
      return response(attempts.length === 1 ? 401 : 202);
    },
    refreshAccessToken: async () => "fresh-token",
    sessionExpiredMessage: "Session expired",
  });

  assert.equal(result.status, 202);
  assert.deepEqual(attempts, [
    { token: "stale-token", body },
    { token: "fresh-token", body },
  ]);
});

test("concurrent 401s share one in-flight refresh", async () => {
  let refreshCount = 0;
  let releaseRefresh: ((token: string | null) => void) | null = null;
  const refreshGate = new Promise<string | null>((resolve) => {
    releaseRefresh = resolve;
  });

  const refreshAccessToken = async () => {
    refreshCount += 1;
    return refreshGate;
  };

  const makeRequest = () => {
    let attempts = 0;
    return requestWithAuthRecovery({
      initialAccessToken: "stale-token",
      request: async () => {
        attempts += 1;
        return response(attempts === 1 ? 401 : 200);
      },
      refreshAccessToken,
      sessionExpiredMessage: "Session expired",
    });
  };

  const first = makeRequest();
  const second = makeRequest();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(refreshCount, 1);
  releaseRefresh?.("fresh-token");

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.status, 200);
  assert.equal(secondResult.status, 200);
  assert.equal(refreshCount, 1);
});
