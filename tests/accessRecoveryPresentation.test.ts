import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AuthScreen from "../src/components/auth/AuthScreen.tsx";
import { AccessRefreshNotice, AccessVerificationError } from "../src/components/access/AccessStates.tsx";

test("expired authentication renders sign-in-again copy instead of company-revoked messaging", () => {
  const markup = renderToStaticMarkup(createElement(AuthScreen, { sessionExpiredNotice: true } as never));

  assert.match(markup, /Your session expired\. Sign in again\./);
  assert.doesNotMatch(markup, /Company access unavailable/);
});

test("a technical access-verification failure offers retry without claiming membership revocation", () => {
  const markup = renderToStaticMarkup(createElement(AccessVerificationError, {
    onRetry: () => undefined,
    onSignOut: () => undefined,
  }));

  assert.match(markup, /We couldn.t verify company access/);
  assert.match(markup, /Try again/);
  assert.doesNotMatch(markup, /Company access unavailable/);
});

test("same-user background verification uses a compact non-blocking status notice", () => {
  const markup = renderToStaticMarkup(createElement(AccessRefreshNotice, {
    isRefreshing: false,
    refreshError: "Failed to fetch",
    onRetry: () => undefined,
  }));

  assert.match(markup, /role="status"/);
  assert.match(markup, /last verified workspace is still open/i);
  assert.match(markup, /Retry/);
  assert.doesNotMatch(markup, /Company access unavailable/);
});
