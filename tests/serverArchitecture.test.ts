import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const server = source("server.ts");
const authorization = source("src/server/auth/serverAuthorization.ts");
const publicProspects = source("src/server/publicProspects/publicProspectRouter.ts");
const companyAi = source("src/server/ai/companyAiRouter.ts");
const messaging = source("src/server/messaging/messagingRouter.ts");
const extraction = source("src/server/invoiceExtraction/invoiceExtractionRouter.ts");
const delivery = source("src/server/documentDelivery/documentDeliveryRouter.ts");
const issuedDocuments = source("src/server/documentDelivery/issuedDocumentRouter.ts");

test("server.ts is an Express composition and bootstrap boundary", () => {
  assert.ok(server.split(/\r?\n/).length < 300, "server.ts should remain materially smaller than the pre-Slice 3 hub");
  for (const router of [
    "createPublicProspectRouter",
    "createCompanyAiRouter",
    "createMessagingRouter",
    "createInvoiceExtractionRouter",
    "createDocumentDeliveryRouter",
    "createIssuedDocumentRouter",
  ]) assert.match(server, new RegExp(`${router}\\(\\)`));

  assert.doesNotMatch(server, /app\.(?:post|get|put|patch|delete)\("\/api\/(?:public\/prospects|deployment\/|platform\/|document-delivery-history|messaging\/|storage\/health|extract-|issued-documents)/);
  assert.doesNotMatch(server, /ApiAuthorizationError|authorizeCompanyRequest|buildInvoiceCandidate|claim_document_send_intent|submit_public_prospect/);
  assert.match(server, /app\.get\("\/api\/health"/);
  assert.match(server, /createViteServer|express\.static|app\.listen/);
});

test("moved route domains expose focused homes without a replacement mega-router", () => {
  assert.match(authorization, /export class ApiAuthorizationError/);
  assert.match(publicProspects, /router\.post\("\/prospects"/);
  assert.match(companyAi, /router\.(?:get|put|post|delete)\("\/(?:deployment|platform)/);
  assert.match(messaging, /router\.(?:get|post)\("\/messaging\//);
  assert.match(extraction, /router\.post\("\/extract-(?:invoice|expense)"/);
  assert.match(delivery, /router\.get\("\/document-delivery-history"/);
  assert.match(issuedDocuments, /router\.get\("\/issued-documents\//);

  for (const file of ["src/server/serverHelpers.ts", "src/server/serverController.ts", "src/server/allRoutes.ts"]) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, `${file} must not become a replacement abstraction`);
  }
});
