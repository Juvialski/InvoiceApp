import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertHostedQaTarget,
  HOSTED_QA_DEPLOYMENT_READY_TIMEOUT_MS,
  waitForHostedQaHealth,
  type HostedQaHealthExpectation,
  type HostedQaHealthSnapshot,
} from "./hostedQaContracts.ts";

const BASE_URL = (process.env.QA_E2E_BASE_URL || "https://hydroqualisense-qa.onrender.com").replace(/\/+$/, "");
const EXPECTED_DEPLOYMENT_ID = String(process.env.QA_E2E_EXPECTED_DEPLOYMENT_ID || "").trim();
const EXPECTED_REPOSITORY_SHA = String(process.env.QA_E2E_EXPECTED_REPOSITORY_SHA || process.env.GITHUB_SHA || "").trim().toLowerCase();
const EXPECTED_MIGRATION_LEVEL = String(process.env.QA_E2E_EXPECTED_MIGRATION_LEVEL || "").trim();
const OUTPUT_PATH = path.resolve(process.env.QA_E2E_OUTPUT_PATH || "artifacts/qa-release/render-readiness.json");

function safeFailure(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 500) : "Render health request failed.";
}

async function readHealthSnapshot(): Promise<HostedQaHealthSnapshot> {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, { headers: { Accept: "application/json" } });
    let body: unknown = null;
    try { body = await response.json(); } catch { /* normalize below */ }
    const release = body && typeof body === "object" && !Array.isArray(body) && "release" in body
      && body.release && typeof body.release === "object" && !Array.isArray(body.release)
      ? body.release as Record<string, unknown>
      : null;
    return { httpStatus: response.status, release };
  } catch (error) {
    return { httpStatus: null, release: null, failure: safeFailure(error) };
  }
}

async function main(): Promise<void> {
  assertHostedQaTarget(BASE_URL);
  if (!EXPECTED_DEPLOYMENT_ID || !EXPECTED_REPOSITORY_SHA || !EXPECTED_MIGRATION_LEVEL) {
    throw new Error("Render readiness requires the exact QA deployment ID, repository SHA, and repository migration level.");
  }
  const expectation: HostedQaHealthExpectation = {
    environment: "qa",
    deploymentId: EXPECTED_DEPLOYMENT_ID,
    repositorySha: EXPECTED_REPOSITORY_SHA,
    migrationLevel: EXPECTED_MIGRATION_LEVEL,
  };
  const configuredTimeout = Number(process.env.QA_E2E_DEPLOYMENT_READY_TIMEOUT_MS || "");
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.min(Math.trunc(configuredTimeout), HOSTED_QA_DEPLOYMENT_READY_TIMEOUT_MS)
    : HOSTED_QA_DEPLOYMENT_READY_TIMEOUT_MS;
  const readiness = await waitForHostedQaHealth(readHealthSnapshot, expectation, { timeoutMs });
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify({
    schemaVersion: 1,
    status: readiness.status,
    baseUrl: BASE_URL,
    expected: expectation,
    attempts: readiness.attempts,
    waitedMs: readiness.waitedMs,
    release: readiness.snapshot.release,
    failureReasons: readiness.failureReasons,
    failure: readiness.snapshot.failure || null,
    timestamp: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
  if (readiness.status !== "PASS") {
    const classification = readiness.status === "TIMEOUT" ? "render_deployment_timeout" : "render_identity_mismatch";
    throw new Error(`${classification}: ${readiness.failureReasons.join(", ") || readiness.snapshot.failure || "unknown Render readiness failure"}`);
  }
  console.log(`Render QA readiness=PASS attempts=${readiness.attempts} expected-sha=${EXPECTED_REPOSITORY_SHA} migration=${EXPECTED_MIGRATION_LEVEL}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Render QA readiness failed.");
  process.exitCode = 1;
}
