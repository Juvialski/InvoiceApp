import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const browserClient = readFileSync(new URL("../src/lib/companyApi.ts", import.meta.url), "utf8");

function routeBody(path: string) {
  const start = server.indexOf(path);
  assert.notEqual(start, -1, `missing route ${path}`);
  const next = server.indexOf("\napp.", start + path.length);
  return server.slice(start, next === -1 ? undefined : next);
}

test("company-specific AI and Gmail routes require a database permission check", () => {
  for (const [path, permission] of [
    ["/api/classify-email", "invoices.extract"],
    ["/api/extract-invoice", "invoices.extract"],
    ["/api/gmail/profile", "gmail.read"],
    ["/api/gmail/scan", "gmail.read"],
    ["/api/gmail/history", "gmail.read"],
    ["/api/gmail/import", "gmail.manage"],
  ] as const) {
    const body = routeBody(path);
    assert.match(body, /authorizeCompanyRequest\(req, /);
    assert.match(body, new RegExp(`"${permission.replace(".", "\\.")}"`));
  }
});

test("the Express API separates Supabase and Google bearer tokens", () => {
  assert.match(server, /req\.headers\["x-gmail-access-token"\]/);
  assert.match(server, /client\.auth\.getUser\(accessToken\)/);
  assert.match(server, /client\.rpc\("has_company_permission"/);
  assert.doesNotMatch(server, /getGoogleAccessToken[\s\S]{0,250}req\.headers\.authorization/);
  assert.doesNotMatch(server, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("browser API helper sends the selected company and Supabase session", () => {
  assert.match(browserClient, /supabase\.auth\.getSession\(\)/);
  assert.match(browserClient, /headers\.set\("Authorization", `Bearer \$\{data\.session\.access_token\}`\)/);
  assert.match(browserClient, /headers\.set\("X-Company-Id", options\.companyId\)/);
  assert.match(browserClient, /X-Gmail-Access-Token/);
});

