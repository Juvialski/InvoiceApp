import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildRepositoryIndex,
  formatRepositoryIndexSummary,
  getDefaultCacheDirectory,
  type RepositoryIndexResult,
} from "../scripts/repository-intelligence/indexer.ts";

interface Fixture {
  readonly root: string;
  readonly cacheDir: string;
  write(relativePath: string, contents: string): void;
  remove(relativePath: string): void;
  rename(from: string, to: string): void;
  stage(): void;
  commit(message: string): void;
  dispose(): void;
}

const SOURCE_FILE = `import { helper as imported } from "./helper";
import type { Shape } from "./types";

export { helper } from "./helper";
export * from "./re-export";

export const answer = imported;
export interface Widget { name: string; }
export type Alias = Shape;
export function greet(value: string): string { return value; }
export class Worker { run(): void {} }
const hidden = 1;
`;

const BASE_FILES: Record<string, string> = {
  ".gitignore": ".test-cache/\n.second-cache/\n",
  "src/index.ts": SOURCE_FILE,
  "src/helper.ts": "export const helper = \"fixture\";\n",
  "src/re-export.ts": "export const reExported = true;\n",
  "src/types.ts": "export interface Shape { width: number; }\n",
  "src/component.tsx": "export function Component(): JSX.Element { return <div />; }\n",
  "src/default.ts": "export default function () { return true; }\n",
  "scripts/tool.ts": "export const tool = true;\n",
  "tests/fixture.test.ts": "test(\"fixture\", () => {});\n",
  "__tests__/root-fixture.ts": "export const rootFixture = true;\n",
  "docs/README.md": "# Fixture documentation\n",
  "supabase/migrations/20260919000000_fixture.sql": "create table fixture (id integer);\n",
  ".env": "FAKE_SECRET_VALUE=fixture-only\n",
  "secrets/credentials.json": "{\"token\":\"FAKE_CREDENTIAL_VALUE\"}\n",
  "private/server.key": "FAKE_PRIVATE_KEY_VALUE\n",
  "node_modules/vendor/index.js": "module.exports = {};\n",
  "vendor/library.js": "export const vendor = true;\n",
  "dist/generated.js": "export const generated = true;\n",
  "coverage/lcov.info": "TN:\n",
  ".cache/local.txt": "FAKE_CACHE_VALUE\n",
  "artifacts/customer-document.pdf": "FAKE_CUSTOMER_DOCUMENT_BYTES\n",
  "src/generated.generated.ts": "export const generated = true;\n",
  "src/binary.dat": "binary\u0000fixture\n",
};

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function createFixture(extraFiles: Record<string, string> = {}): Fixture {
  const root = mkdtempSync(path.join(os.tmpdir(), "hydroqualisense-ri1-"));
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "ri1-fixture@example.test"]);
  git(root, ["config", "user.name", "RI-1 Fixture"]);

  const write = (relativePath: string, contents: string) => {
    const absolutePath = path.join(root, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents, "utf8");
  };
  const remove = (relativePath: string) => {
    rmSync(path.join(root, relativePath), { force: true, recursive: true });
  };
  const rename = (from: string, to: string) => {
    const destination = path.join(root, to);
    mkdirSync(path.dirname(destination), { recursive: true });
    renameSync(path.join(root, from), destination);
  };
  const stage = () => {
    execFileSync("git", ["-C", root, "add", "--all"], { stdio: "ignore" });
  };
  const commit = (message: string) => {
    stage();
    execFileSync("git", ["-C", root, "commit", "--quiet", "-m", message], { stdio: "ignore" });
  };

  for (const [relativePath, contents] of Object.entries({ ...BASE_FILES, ...extraFiles })) {
    write(relativePath, contents);
  }
  stage();
  execFileSync("git", ["-C", root, "commit", "--quiet", "-m", "fixture"], { stdio: "ignore" });

  return {
    root,
    cacheDir: path.join(root, ".test-cache", "repository-intelligence"),
    write,
    remove,
    rename,
    stage,
    commit,
    dispose: () => rmSync(root, { force: true, recursive: true }),
  };
}

function runFull(fixture: Fixture): RepositoryIndexResult {
  return buildRepositoryIndex({ rootDir: fixture.root, cacheDir: fixture.cacheDir, mode: "full" });
}

function runIncremental(fixture: Fixture, options: { schemaVersion?: number; generatorVersion?: string } = {}): RepositoryIndexResult {
  return buildRepositoryIndex({
    rootDir: fixture.root,
    cacheDir: fixture.cacheDir,
    mode: "incremental",
    ...options,
  });
}

function recordFor(result: RepositoryIndexResult, relativePath: string) {
  const record = result.index.files.find((file) => file.path === relativePath);
  assert.ok(record, `missing indexed record for ${relativePath}`);
  return record;
}

function allCacheText(cacheDir: string): string {
  const values: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(entryPath);
      else values.push(readFileSync(entryPath, "utf8"));
    }
  };
  walk(cacheDir);
  return values.join("\n");
}

test("RI-1 indexes tracked files and extracts deterministic TypeScript facts", () => {
  const fixture = createFixture();
  try {
    const result = runFull(fixture);
    const source = recordFor(result, "src/index.ts");

    assert.deepEqual(result.index.dirtyTrackedPaths, []);
    assert.deepEqual(result.index.files.map((file) => file.path), [...result.index.files.map((file) => file.path)].sort());
    assert.equal(source.language, "typescript");
    assert.equal(source.classification, "source");
    assert.equal(recordFor(result, "tests/fixture.test.ts").classification, "test");
    assert.equal(recordFor(result, "__tests__/root-fixture.ts").classification, "test");
    assert.equal(recordFor(result, "scripts/tool.ts").classification, "script");
    assert.equal(recordFor(result, "docs/README.md").classification, "documentation");
    assert.equal(recordFor(result, "supabase/migrations/20260919000000_fixture.sql").classification, "migration");
    assert.ok(recordFor(result, "src/default.ts").exports.some((entry) => entry.exportedName === "default" && entry.kind === "default"));
    assert.deepEqual(source.imports.map((reference) => reference.moduleSpecifier), ["./helper", "./types"]);
    assert.ok(source.exports.some((entry) => entry.exportedName === "answer" && entry.kind === "local"));
    assert.ok(source.reExports.some((entry) => entry.moduleSpecifier === "./helper"));
    assert.ok(source.reExports.some((entry) => entry.moduleSpecifier === "./re-export" && entry.exportedName === "*"));
    assert.ok(source.symbols.some((symbol) => symbol.qualifiedName === "greet" && symbol.kind === "function" && symbol.isExported));
    assert.ok(source.symbols.some((symbol) => symbol.qualifiedName === "Worker.run" && symbol.kind === "method"));
    assert.ok(source.symbols.every((symbol) => !/:\d+(?::|$)/.test(symbol.id)));
    const greetId = source.symbols.find((symbol) => symbol.qualifiedName === "greet")?.id;
    assert.ok(greetId);
    fixture.write("src/index.ts", `// line movement must not change symbol identity\n\n${SOURCE_FILE}`);
    fixture.stage();
    const moved = runIncremental(fixture);
    assert.deepEqual(moved.index.dirtyTrackedPaths, ["src/index.ts"]);
    assert.equal(recordFor(moved, "src/index.ts").symbols.find((symbol) => symbol.qualifiedName === "greet")?.id, greetId);
    assert.equal(result.summary.reparsed, result.summary.eligibleFiles);
    assert.equal(result.summary.excludedFiles, Object.keys(BASE_FILES).length - result.summary.eligibleFiles);
  } finally {
    fixture.dispose();
  }
});

test("RI-1 reuses unchanged records without reparsing them", () => {
  const fixture = createFixture();
  try {
    const initial = runFull(fixture);
    const next = runIncremental(fixture);

    assert.equal(next.summary.reparsed, 0);
    assert.equal(next.summary.reused, initial.summary.eligibleFiles);
    assert.deepEqual(next.summary.reparsedPaths, []);
    assert.deepEqual(next.summary.reusedPaths, initial.index.files.map((file) => file.path));
    assert.deepEqual(next.index, initial.index);
  } finally {
    fixture.dispose();
  }
});

test("RI-1 reparses only a modified file and records its hash change", () => {
  const fixture = createFixture();
  try {
    runFull(fixture);
    fixture.write("src/helper.ts", "export const helper = \"changed\";\n");
    fixture.stage();
    const result = runIncremental(fixture);

    assert.equal(result.summary.reparsed, 1);
    assert.deepEqual(result.index.dirtyTrackedPaths, ["src/helper.ts"]);
    assert.deepEqual(result.summary.reparsedPaths, ["src/helper.ts"]);
    assert.equal(result.summary.hashChanged, 1);
    assert.equal(result.summary.reused, result.summary.eligibleFiles - 1);
  } finally {
    fixture.dispose();
  }
});

test("RI-1 includes an added tracked file deterministically", () => {
  const fixture = createFixture();
  try {
    runFull(fixture);
    fixture.write("src/added.ts", "export const added = true;\n");
    fixture.stage();
    const result = runIncremental(fixture);

    assert.equal(result.summary.added, 1);
    assert.deepEqual(result.summary.reparsedPaths, ["src/added.ts"]);
    assert.equal(recordFor(result, "src/added.ts").contentHash.length, 64);
  } finally {
    fixture.dispose();
  }
});

test("RI-1 removes a deleted record from incremental output", () => {
  const fixture = createFixture();
  try {
    runFull(fixture);
    fixture.remove("src/helper.ts");
    fixture.stage();
    const result = runIncremental(fixture);

    assert.equal(result.summary.deleted, 1);
    assert.equal(result.index.files.some((file) => file.path === "src/helper.ts"), false);
    const manifest = JSON.parse(readFileSync(path.join(fixture.cacheDir, "manifest.json"), "utf8")) as { files: Array<{ path: string }> };
    assert.equal(manifest.files.some((file) => file.path === "src/helper.ts"), false);
  } finally {
    fixture.dispose();
  }
});

test("RI-1 treats a deterministic path change as a rename", () => {
  const fixture = createFixture();
  try {
    runFull(fixture);
    fixture.rename("src/helper.ts", "src/renamed-helper.ts");
    fixture.stage();
    const result = runIncremental(fixture);

    assert.equal(result.summary.renamed, 1);
    assert.equal(result.summary.reparsed, 1);
    assert.equal(result.index.files.some((file) => file.path === "src/helper.ts"), false);
    assert.ok(recordFor(result, "src/renamed-helper.ts"));
    const manifest = JSON.parse(readFileSync(path.join(fixture.cacheDir, "manifest.json"), "utf8")) as { files: Array<{ path: string }> };
    assert.equal(manifest.files.some((file) => file.path === "src/helper.ts"), false);
  } finally {
    fixture.dispose();
  }
});

test("RI-1 invalidates the cache when the schema or generator version changes", () => {
  const fixture = createFixture();
  try {
    const initial = runFull(fixture);
    const result = runIncremental(fixture, {
      schemaVersion: initial.index.schemaVersion + 1,
      generatorVersion: `${initial.index.generatorVersion}-test-invalidation`,
    });

    assert.equal(result.summary.cacheInvalidated, true);
    assert.equal(result.summary.reparsed, initial.summary.eligibleFiles);
    assert.equal(result.summary.reused, 0);
    assert.equal(result.index.schemaVersion, initial.index.schemaVersion + 1);
  } finally {
    fixture.dispose();
  }
});

test("RI-1 recovers from a corrupt cache with a full rebuild", () => {
  const fixture = createFixture();
  try {
    const initial = runFull(fixture);
    writeFileSync(path.join(fixture.cacheDir, "manifest.json"), "not-json", "utf8");
    const result = runIncremental(fixture);

    assert.equal(result.summary.cacheRecovered, true);
    assert.equal(result.summary.reparsed, initial.summary.eligibleFiles);
    assert.deepEqual(result.index, initial.index);
  } finally {
    fixture.dispose();
  }
});

test("RI-1 full rebuild and incremental convergence have equivalent semantic indexes", () => {
  const fixture = createFixture();
  try {
    runFull(fixture);
    fixture.write("src/helper.ts", "export const helper = \"converged\";\n");
    fixture.write("src/converged.ts", "export const converged = true;\n");
    fixture.remove("src/re-export.ts");
    fixture.stage();

    const incremental = runIncremental(fixture);
    const full = buildRepositoryIndex({
      rootDir: fixture.root,
      cacheDir: path.join(fixture.root, ".second-cache", "repository-intelligence"),
      mode: "full",
    });

    assert.deepEqual(incremental.index, full.index);
  } finally {
    fixture.dispose();
  }
});

test("RI-1 excludes secrets, generated, vendor, cache, and binary paths without persisting contents", () => {
  const fixture = createFixture();
  try {
    const result = runFull(fixture);
    const excluded = new Map(result.index.excludedFiles.map((file) => [file.path, file] as const));

    for (const relativePath of [
      ".env",
      "secrets/credentials.json",
      "private/server.key",
      "node_modules/vendor/index.js",
      "vendor/library.js",
      "dist/generated.js",
      "coverage/lcov.info",
      ".cache/local.txt",
      "artifacts/customer-document.pdf",
      "src/generated.generated.ts",
      "src/binary.dat",
    ]) {
      assert.ok(excluded.has(relativePath), `expected ${relativePath} to be excluded`);
      assert.equal(result.index.files.some((file) => file.path === relativePath), false);
    }

    const cacheText = allCacheText(fixture.cacheDir);
    assert.equal(cacheText.includes("FAKE_SECRET_VALUE"), false);
    assert.equal(cacheText.includes("FAKE_CREDENTIAL_VALUE"), false);
    assert.equal(cacheText.includes("FAKE_PRIVATE_KEY_VALUE"), false);
    assert.equal(cacheText.includes("FAKE_CUSTOMER_DOCUMENT_BYTES"), false);
    assert.equal(excluded.get(".env")?.classification, "excluded");
    assert.equal(excluded.get("dist/generated.js")?.classification, "generated");
    assert.equal(excluded.get("vendor/library.js")?.classification, "vendor");
    assert.equal(excluded.get(".cache/local.txt")?.classification, "cache");
    assert.equal(excluded.get("src/binary.dat")?.reason, "binary content");
    assert.equal(cacheText.includes(SOURCE_FILE), false);
  } finally {
    fixture.dispose();
  }
});

test("RI-1 incremental mode touches substantially fewer files than a clean rebuild", () => {
  const manyFiles = Object.fromEntries(
    Array.from({ length: 16 }, (_, index) => [`src/performance-${String(index).padStart(2, "0")}.ts`, `export const value${index} = ${index};\n`]),
  );
  const fixture = createFixture(manyFiles);
  try {
    const full = runFull(fixture);
    fixture.write("src/performance-07.ts", "export const value7 = 700;\n");
    fixture.stage();
    const incremental = runIncremental(fixture);

    assert.ok(full.summary.reparsed >= 16);
    assert.equal(incremental.summary.reparsed, 1);
    assert.ok(incremental.summary.reparsed < full.summary.reparsed / 4);
  } finally {
    fixture.dispose();
  }
});

test("RI-1 ignores untracked files by default", () => {
  const fixture = createFixture();
  try {
    runFull(fixture);
    fixture.write("src/untracked.ts", "export const shouldNotAppear = true;\n");
    const result = runIncremental(fixture);

    assert.equal(result.index.files.some((file) => file.path === "src/untracked.ts"), false);
    assert.equal(result.summary.added, 0);
  } finally {
    fixture.dispose();
  }
});

test("RI-1 exposes the disposable default cache location", () => {
  const fixture = createFixture();
  try {
    assert.equal(getDefaultCacheDirectory(fixture.root), path.join(fixture.root, ".cache", "repository-intelligence"));
    const result = runFull({ ...fixture, cacheDir: getDefaultCacheDirectory(fixture.root) });
    assert.equal(statSync(path.join(fixture.root, ".cache", "repository-intelligence", "manifest.json")).isFile(), true);
    assert.ok(result.index.files.length > 0);
  } finally {
    fixture.dispose();
  }
});

test("RI-1 CLI summary is concise and does not print indexed source content", () => {
  const fixture = createFixture();
  try {
    const result = runFull(fixture);
    const summary = formatRepositoryIndexSummary(result);

    assert.match(summary, /RI-1 repository index updated/);
    assert.match(summary, /eligible=\d+/);
    assert.match(summary, /reparsed=\d+/);
    assert.equal(summary.includes(SOURCE_FILE), false);
    assert.equal(summary.includes("FAKE_SECRET_VALUE"), false);
  } finally {
    fixture.dispose();
  }
});
