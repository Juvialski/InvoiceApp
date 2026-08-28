import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";

async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err: any) => {
      if (err.code === "EADDRINUSE") resolve(true);
      else resolve(false);
    });
    server.once("listening", () => {
      server.once("close", () => resolve(false)).close();
    });
    server.listen(port);
  });
}

test("visual QA harness: cleanly terminates owned dev server upon controlled failure", async () => {
  const isWin = process.platform === "win32";
  const cmd = isWin ? "npx.cmd" : "npx";

  // 1. Verify port 3000 is initially free
  const initiallyInUse = await isPortInUse(3000);
  assert.equal(initiallyInUse, false, "Port 3000 must not be in use before test");

  // 2. Launch test-visual-canvas with --test-controlled-failure
  const child = spawn(cmd, ["tsx", "scripts/test-visual-canvas.ts", "--test-controlled-failure"], {
    stdio: "ignore",
    shell: isWin,
    env: { ...process.env, PORT: "3000" },
  });

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on("close", (code) => resolve(code));
    child.on("error", () => resolve(1));
  });

  // 3. Command must exit non-zero (failure exit code preserved)
  assert.equal(exitCode, 1, "Harness must exit with code 1 upon failure");

  // 4. Server process must be completely gone and port 3000 released
  const stillInUse = await isPortInUse(3000);
  assert.equal(stillInUse, false, "Port 3000 must be released after failure cleanup");
});
