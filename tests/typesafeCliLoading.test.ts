import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("optional advisory CLI help and invalid arguments work without advisory modules or SDK", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "typesafe-cli-loading-"));
  const cli = path.join(directory, "cli.ts");
  try {
    // Copy only the entrypoint: any eager runtime import fails in this sandbox.
    copyFileSync(new URL("../scripts/developer-intelligence/typesafe/cli.ts", import.meta.url), cli);
    const help = spawnSync(process.execPath, ["--experimental-strip-types", cli, "help"], {
      encoding: "utf8", windowsHide: true,
    });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage: npm.cmd run typesafe/);
    assert.match(help.stdout, /explicit --live flag/);

    const invalid = spawnSync(process.execPath, ["--experimental-strip-types", cli, "unknown-command"], {
      encoding: "utf8", windowsHide: true,
    });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /"errorType":"Error"/);
    assert.doesNotMatch(invalid.stderr, /ERR_MODULE_NOT_FOUND/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
