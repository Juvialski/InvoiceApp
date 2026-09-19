import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const authorization = readFileSync(new URL("../src/server/auth/serverAuthorization.ts", import.meta.url), "utf8");
const invoiceExtraction = readFileSync(new URL("../src/server/invoiceExtraction/invoiceExtractionRouter.ts", import.meta.url), "utf8");
const messaging = readFileSync(new URL("../src/server/messaging/messagingRouter.ts", import.meta.url), "utf8");
const browserClient = readFileSync(new URL("../src/lib/companyApi.ts", import.meta.url), "utf8");
const legacyBrowserClient = readFileSync(new URL("../src/lib/supabase.ts", import.meta.url), "utf8");
const brevoProvider = readFileSync(new URL("../src/server/messaging/brevoEmailProvider.ts", import.meta.url), "utf8");
const assistantHandler = readFileSync(new URL("../src/server/assistant/assistantHandler.ts", import.meta.url), "utf8");

function routeBody(source: string, path: string, nextPath?: string) {
  const start = source.indexOf(path);
  assert.notEqual(start, -1, `missing route ${path}`);
  const next = nextPath ? source.indexOf(nextPath, start + path.length) : -1;
  return source.slice(start, next === -1 ? undefined : next);
}

test("company-specific AI and Brevo email routes require a database permission check", () => {
  for (const [path, permission] of [
    ["/api/extract-invoice", "invoices.extract"],
    ["/api/extract-expense", "expenses.manage"],
    ["/api/messaging/email/send", "documents.send"],
  ] as const) {
    const body = path === "/api/extract-invoice"
      ? routeBody(invoiceExtraction, 'router.post("/extract-invoice"', 'router.post("/extract-expense"')
      : path === "/api/extract-expense"
        ? routeBody(invoiceExtraction, 'router.post("/extract-expense"', "return router")
        : routeBody(messaging, 'router.post("/messaging/email/send"', "return router");
    assert.match(body, /authorizeCompanyRequest\(req, /);
    assert.match(body, new RegExp(`"${permission.replace(".", "\\.")}"`));
  }
  assert.match(server, /app\.use\("\/api\/assistant"[\s\S]*createAssistantRouter\(\)/);
  assert.match(assistantHandler, /router\.post\("\/cancel"/);
  assert.match(authorization, /p_company_id: companyId/);
  assert.match(authorization, /p_permission_key: permission/);
  assert.match(authorization, /headerCompanyId = firstHeaderValue\(req\.headers\["x-company-id"\]\)/);
  assert.match(authorization, /headerCompanyId !== companyId/);
});

test("the Express API keeps Supabase authentication and Brevo credentials server-side", () => {
  assert.doesNotMatch(server, /x-gmail-access-token|X-Gmail-Access-Token|gmail\.googleapis\.com/i);
  assert.match(authorization, /client\.auth\.getUser\(accessToken\)/);
  assert.match(authorization, /client\.rpc\("has_company_permission"/);
  assert.match(brevoProvider, /BREVO_API_KEY/);
  assert.doesNotMatch(browserClient, /BREVO_API_KEY|BREVO_SENDER_EMAIL/);
  assert.doesNotMatch(server, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("browser API helper sends the deployment company and Supabase session", () => {
  assert.match(browserClient, /supabase\.auth\.getSession\(\)/);
  assert.match(browserClient, /initialAccessToken: data\.session\.access_token/);
  assert.match(browserClient, /headers\.set\("Authorization", `Bearer \$\{accessToken\}`\)/);
  assert.match(browserClient, /refreshAccessToken: async \(\) =>/);
  assert.match(browserClient, /assertDeploymentCompanyId\(deploymentCompanyId, options\.companyId/);
  assert.match(browserClient, /headers\.set\("X-Company-Id", deploymentCompanyId\)/);
  assert.doesNotMatch(browserClient, /X-Gmail-Access-Token/);
  assert.match(legacyBrowserClient, /const deploymentCompanyId = getActiveCompanyId\(\)/);
  assert.match(legacyBrowserClient, /requestedCompanyId !== deploymentCompanyId/);
  assert.doesNotMatch(legacyBrowserClient, /options\.companyId \|\| getActiveCompanyId/);
});

