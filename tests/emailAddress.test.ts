import assert from "node:assert/strict";
import test from "node:test";
import { DISALLOWED_DOMAIN_RULES, normalizeDomain, normalizeEmail, parseSenderAddress } from "../src/lib/emailAddress.ts";

test("provider-neutral email address helpers preserve safe sender parsing", () => {
  assert.equal(normalizeEmail("  Person@Example.COM "), "person@example.com");
  assert.equal(normalizeDomain("*@Sub.Example.COM/path"), "sub.example.com");
  assert.deepEqual(parseSenderAddress('"Accounts Payable" <billing@example.com>'), { name: "Accounts Payable", email: "billing@example.com", domain: "example.com" });
  assert.equal(DISALLOWED_DOMAIN_RULES.has("gmail.com"), true);
});
