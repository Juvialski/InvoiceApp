import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import {
  isPortInUse,
  isServerReady,
  startDevServer,
  terminateChildServer,
} from "../scripts/qa/devServerLifecycle.ts";

const TEST_PORT_BASE = 31000 + (process.pid % 1000) * 3;

test("devServerLifecycle: starts clean server, verifies startup, and cleanly releases port upon failure", { concurrency: false }, async () => {
  const PORT = TEST_PORT_BASE;
  const BASE_URL = `http://localhost:${PORT}`;

  // 1. Independently verify port 3000 is free before starting
  const portInitiallyUsed = await isPortInUse(PORT);
  assert.equal(portInitiallyUsed, false, `Port ${PORT} must be free before test`);

  let serverProcess: any = null;
  let controlledErrorThrown = false;

  try {
    // 2. Start QA-owned dev server
    serverProcess = await startDevServer({ port: PORT, baseUrl: BASE_URL, startupPath: "/workflow-map" });

    // 3. Independently verify the server actually started and is responding
    assert.ok(serverProcess, "Server process must be returned");
    assert.ok(typeof serverProcess.pid === "number", "Server process must have valid PID");
    const serverActive = await isServerReady(BASE_URL, "/workflow-map");
    assert.equal(serverActive, true, "Dev server must actively respond on /workflow-map after startup");

    // 4. Trigger controlled test failure ONLY after verifying server is alive
    controlledErrorThrown = true;
    throw new Error("Controlled test-only failure triggered after verified startup");
  } catch (err: any) {
    assert.equal(controlledErrorThrown, true);
    assert.match(err.message, /Controlled test-only failure/);
  } finally {
    // 5. Cleanup server process tree
    await terminateChildServer(serverProcess, { port: PORT, baseUrl: BASE_URL });
  }

  // 6. Independently verify server process is terminated and port 3000 released
  const portAfterCleanup = await isPortInUse(PORT);
  const serverAfterCleanup = await isServerReady(BASE_URL, "/workflow-map");
  assert.equal(portAfterCleanup, false, "Port 3000 must be freed after termination");
  assert.equal(serverAfterCleanup, false, "Dev server must no longer respond after termination");
});

test("devServerLifecycle: refuses to start when target port is already occupied", { concurrency: false }, async () => {
  const PORT = TEST_PORT_BASE + 1;
  const BASE_URL = `http://localhost:${PORT}`;

  let firstServer: any = null;
  try {
    firstServer = await startDevServer({ port: PORT, baseUrl: BASE_URL });
    assert.ok(firstServer.pid);

    // Attempting to start second server on same port must throw without killing first
    await assert.rejects(
      async () => {
        await startDevServer({ port: PORT, baseUrl: BASE_URL });
      },
      (err: any) => {
        assert.match(err.message, /already occupied before test run/);
        return true;
      }
    );
  } finally {
    if (firstServer) {
      await terminateChildServer(firstServer, { port: PORT, baseUrl: BASE_URL });
    }
  }

  assert.equal(await isPortInUse(PORT), false);
});

test("devServerLifecycle: terminateChildServer throws if cleanup verification expires while port remains occupied", async () => {
  const http = await import("node:http");
  const TEST_PORT = TEST_PORT_BASE + 2;
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("ok");
  });
  await new Promise<void>((r) => mockServer.listen(TEST_PORT, () => r()));

  try {
    const fakeChild: any = { pid: 999999 };
    await assert.rejects(
      async () => {
        await terminateChildServer(fakeChild, { port: TEST_PORT, timeoutMs: 600 });
      },
      (err: any) => {
        assert.match(err.message, /remained active after 600ms cleanup timeout/);
        return true;
      }
    );
  } finally {
    await new Promise<void>((r) => mockServer.close(() => r()));
  }
});
