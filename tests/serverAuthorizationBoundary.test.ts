import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ApiAuthorizationError,
  requestBearerToken,
} from "../src/server/auth/serverAuthorization.ts";

const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const authorization = readFileSync(new URL("../src/server/auth/serverAuthorization.ts", import.meta.url), "utf8");

test("server authorization has one focused implementation boundary", () => {
  assert.match(server, /createCompanyAiRouter|createInvoiceExtractionRouter/);
  assert.match(authorization, /export type CompanyPermission/);
  assert.match(authorization, /export interface CompanyRequestAuthorization/);
  assert.match(authorization, /export class ApiAuthorizationError/);
  assert.match(authorization, /export async function authorizeCompanyRequest/);
  assert.match(authorization, /export async function authorizePlatformCompanyRequest/);
  assert.doesNotMatch(server, /class ApiAuthorizationError/);
  assert.doesNotMatch(server, /async function authorizeCompanyRequest/);
  assert.doesNotMatch(server, /async function authorizePlatformCompanyRequest/);
});

test("malformed or missing bearer credentials fail closed with the existing API error", () => {
  for (const authorizationHeader of [undefined, "Basic abc", "Bearer", "Bearer token extra"]) {
    const request = { headers: authorizationHeader === undefined ? {} : { authorization: authorizationHeader } } as any;
    assert.throws(
      () => requestBearerToken(request),
      (error: unknown) => error instanceof ApiAuthorizationError
        && error.status === 401
        && error.code === "UNAUTHENTICATED"
        && error.message === "A valid Hydroqualisense session is required.",
    );
  }
});

test("authorization errors retain status and code mapping for router responses", () => {
  const error = new ApiAuthorizationError(403, "FORBIDDEN", "Denied.");
  assert.equal(error.status, 403);
  assert.equal(error.code, "FORBIDDEN");
  assert.equal(error.name, "ApiAuthorizationError");
});
