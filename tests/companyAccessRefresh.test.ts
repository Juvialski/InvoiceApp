import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CompanyAccessSnapshot } from "../src/lib/companyAccess.ts";
import {
  isCurrentCompanyAccessRequest,
  shouldPreserveCompanyAccessDuringRefresh,
} from "../src/lib/companyAccessRefresh.ts";

const providerSource = readFileSync(new URL("../src/context/CompanyAccessContext.tsx", import.meta.url), "utf8");

function snapshot(overrides: Partial<CompanyAccessSnapshot> = {}): CompanyAccessSnapshot {
  return {
    status: "ready",
    userId: "user-1",
    email: "user@example.com",
    isPlatformOwner: false,
    companies: [{ id: "company-1", name: "Example Co", status: "ACTIVE" }],
    memberships: [{ companyId: "company-1", userId: "user-1", roleKey: "admin", status: "ACTIVE", permissions: [] }],
    activeCompanyId: "company-1",
    permissions: [],
    ...overrides,
  };
}

test("same-user ready access is retained during background refresh", () => {
  assert.equal(shouldPreserveCompanyAccessDuringRefresh(snapshot(), "user-1"), true);
});

test("cold, errored, or different-user access is not retained during refresh", () => {
  assert.equal(shouldPreserveCompanyAccessDuringRefresh(snapshot({ status: "loading" }), "user-1"), false);
  assert.equal(shouldPreserveCompanyAccessDuringRefresh(snapshot({ status: "error" }), "user-1"), false);
  assert.equal(shouldPreserveCompanyAccessDuringRefresh(snapshot(), "user-2"), false);
  assert.equal(shouldPreserveCompanyAccessDuringRefresh(snapshot({ activeCompanyId: null }), "user-1"), false);
});

test("company access request results apply only to the current generation and user", () => {
  assert.equal(isCurrentCompanyAccessRequest(4, 4, "user-1", "user-1"), true);
  assert.equal(isCurrentCompanyAccessRequest(5, 4, "user-1", "user-1"), false);
  assert.equal(isCurrentCompanyAccessRequest(4, 4, "user-2", "user-1"), false);
  assert.equal(isCurrentCompanyAccessRequest(4, 4, null, "user-1"), false);
});

test("provider preserves ready access and records transient background refresh errors separately", () => {
  const refreshStart = providerSource.slice(
    providerSource.indexOf("const preserveCurrentAccess"),
    providerSource.indexOf("const request = (async () =>"),
  );
  assert.match(
    refreshStart,
    /if \(preserveCurrentAccess\)[\s\S]*setIsRefreshing\(true\)[\s\S]*else[\s\S]*resetAuthenticatedContext\("loading"/,
  );

  const refreshFailure = providerSource.slice(
    providerSource.indexOf("} catch (error) {"),
    providerSource.indexOf("} finally {", providerSource.indexOf("} catch (error) {")),
  );
  assert.match(
    refreshFailure,
    /if \(preserveCurrentAccess\)[\s\S]*setRefreshError\(message\)[\s\S]*else[\s\S]*resetAuthenticatedContext\("error"/,
  );
});
