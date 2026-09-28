import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createProductionContentSecurityPolicy,
  THEME_BOOTSTRAP_CSP_HASH,
} from "../src/server/securityPolicy.ts";

test("production CSP allows only the exact inline theme bootstrap script", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(inlineScripts.length, 1);

  const source = inlineScripts[0][1].replace(/\r\n/g, "\n");
  const digest = `sha256-${createHash("sha256").update(source, "utf8").digest("base64")}`;
  assert.equal(digest, THEME_BOOTSTRAP_CSP_HASH);

  const policy = createProductionContentSecurityPolicy("https://qa-example.supabase.co");
  const scriptSource = policy.split(";").map((directive) => directive.trim()).find((directive) => directive.startsWith("script-src "));
  assert.equal(scriptSource, `script-src 'self' '${digest}'`);
  assert.doesNotMatch(scriptSource ?? "", /unsafe-inline/);
  assert.match(policy, /connect-src 'self' https:\/\/qa-example\.supabase\.co https:\/\/generativelanguage\.googleapis\.com wss:/);
});
