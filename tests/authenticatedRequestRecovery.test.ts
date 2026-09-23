import test from "node:test";
import assert from "node:assert/strict";
import {
  publishSessionExpired,
  SESSION_EXPIRED_ERROR_CODE,
  SESSION_EXPIRED_EVENT,
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

test("a temporary refresh network failure is not reported as terminal session expiry", async () => {
  await assert.rejects(
    requestWithAuthRecovery({
      initialAccessToken: "stale-token",
      request: async () => response(401),
      refreshAccessToken: async () => { throw new TypeError("Failed to fetch"); },
      sessionExpiredMessage: "Your session expired. Sign in again.",
    }),
    (error: unknown) => {
      assert.notEqual((error as Error).name, "SessionExpiredError");
      assert.match((error as Error).message, /connection|refresh/i);
      return true;
    },
  );
});

test("concurrent 401s for different users never share a refreshed access token", async () => {
  const observed = new Map<string, string[]>();
  const releases = new Map<string, (token: string) => void>();
  const gates = new Map<string, Promise<string>>();

  for (const userId of ["user-a", "user-b"]) {
    gates.set(userId, new Promise<string>((resolve) => releases.set(userId, resolve)));
    observed.set(userId, []);
  }

  const makeRequest = (userId: string) => requestWithAuthRecovery({
    sessionUserId: userId,
    initialAccessToken: `stale-${userId}`,
    request: async (token) => {
      observed.get(userId)!.push(token);
      return response(observed.get(userId)!.length === 1 ? 401 : 200);
    },
    refreshAccessToken: () => gates.get(userId)!,
    sessionExpiredMessage: "Session expired",
  });

  const first = makeRequest("user-a");
  const second = makeRequest("user-b");
  await Promise.resolve();
  await Promise.resolve();

  releases.get("user-a")!("fresh-user-a");
  releases.get("user-b")!("fresh-user-b");
  await Promise.all([first, second]);

  assert.deepEqual(observed.get("user-a"), ["stale-user-a", "fresh-user-a"]);
  assert.deepEqual(observed.get("user-b"), ["stale-user-b", "fresh-user-b"]);
});

test("terminal auth recovery reports expiry to the owner without reporting temporary network failures", async () => {
  let expiryNotifications = 0;
  await assert.rejects(requestWithAuthRecovery({
    sessionUserId: "user-1",
    initialAccessToken: "stale-token",
    request: async () => response(401),
    refreshAccessToken: async () => null,
    onSessionExpired: () => { expiryNotifications += 1; },
    sessionExpiredMessage: "Your session expired. Sign in again.",
  }), SessionExpiredError);
  assert.equal(expiryNotifications, 1);

  await assert.rejects(requestWithAuthRecovery({
    sessionUserId: "user-1",
    initialAccessToken: "stale-token",
    request: async () => response(401),
    refreshAccessToken: async () => { throw new TypeError("Failed to fetch"); },
    onSessionExpired: () => { expiryNotifications += 1; },
    sessionExpiredMessage: "Your session expired. Sign in again.",
  }));
  assert.equal(expiryNotifications, 1);
});

test("session-expired notifications carry only the originating user identity", () => {
  let dispatched: Event | undefined;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { dispatchEvent: (event: Event) => { dispatched = event; return true; } },
  });
  try {
    publishSessionExpired("user-1");
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }

  assert.equal(dispatched?.type, SESSION_EXPIRED_EVENT);
  assert.deepEqual((dispatched as CustomEvent).detail, { sessionUserId: "user-1" });
});
