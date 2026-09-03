/**
 * Engoryx Test Impact Selector
 *
 * Deterministically selects tests to run based on changed files, static contract
 * mappings, AST dependency graphs, symbol-level granularity for high-churn files,
 * domain clusters, and fallback thresholds.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  SMOKE_TESTS,
  STATIC_CONTRACT_MAPPINGS,
  FALLBACK_FILE_PATTERNS,
  FALLBACK_RATIO_THRESHOLD,
  DATABASE_AFFECTED_PATTERNS,
  normalizePath,
  matchesPattern,
  isDatabaseAffectedFile,
  isFallbackPatternFile
} from './test-impact-config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

export const SYMBOL_GRANULAR_FILES = new Set([
  'src/types.ts',
  'src/lib/persistence.ts'
]);

export interface AstDeclarationRange {
  name: string;
  startLine: number;
  endLine: number;
}

export interface DependencyGraph {
  forwardGraph: Map<string, Set<string>>;
  reverseGraph: Map<string, Set<string>>;
  importDetails: Map<string, Map<string, Set<string>>>;
  fileDeclarations: Map<string, Map<string, AstDeclarationRange>>;
  allTestFiles: string[];
}

export interface ImpactSelectionOptions {
  changedFiles: string[];
  baseSha?: string;
  headSha?: string;
  dependencyGraph?: DependencyGraph;
  changedSymbolsMap?: Map<string, Set<string>>;
  smokeOnly?: boolean;
  isFallback?: boolean;
  fallbackReason?: string;
  packageJsonChangedDepsOrScripts?: boolean;
  skipDiskCheck?: boolean;
}

export interface ImpactSelectionResult {
  baseSha: string;
  headSha: string;
  changedFiles: string[];
  selectedTests: string[];
  testReasons: Record<string, string[]>;
  smokeTests: readonly string[];
  totalAvailableTests: number;
  isFallback: boolean;
  fallbackReason?: string;
  isDatabaseAffected: boolean;
}

export function runGit(args: string[], cwd: string = REPO_ROOT): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return {
    stdout: result.stdout ? result.stdout.trim() : '',
    stderr: result.stderr ? result.stderr.trim() : '',
    status: result.status
  };
}

/**
 * Resolves base and head git references.
 */
export function detectGitRange(
  baseArg?: string,
  headArg?: string,
  cwd: string = REPO_ROOT
): { base: string; head: string; error?: string } {
  const head = headArg || 'HEAD';

  // Verify head rev
  const verifyHead = runGit(['rev-parse', '--verify', head], cwd);
  if (verifyHead.status !== 0) {
    return {
      base: '',
      head,
      error: `Failed to verify head revision "${head}": ${verifyHead.stderr}`
    };
  }
  const headSha = verifyHead.stdout;

  let base = baseArg || '';
  if (!base) {
    // 1. Try git merge-base origin/main HEAD
    const mbOriginMain = runGit(['merge-base', 'origin/main', headSha], cwd);
    if (mbOriginMain.status === 0 && mbOriginMain.stdout) {
      base = mbOriginMain.stdout;
    } else {
      // 2. Try git merge-base main HEAD
      const mbMain = runGit(['merge-base', 'main', headSha], cwd);
      if (mbMain.status === 0 && mbMain.stdout) {
        base = mbMain.stdout;
      } else {
        // 3. Try HEAD~1
        const headParent = runGit(['rev-parse', `${headSha}~1`], cwd);
        if (headParent.status === 0 && headParent.stdout) {
          base = headParent.stdout;
        }
      }
    }
  }

  if (!base) {
    return {
      base: '',
      head: headSha,
      error: 'Could not determine git merge-base against origin/main, main, or HEAD~1'
    };
  }

  const verifyBase = runGit(['rev-parse', '--verify', base], cwd);
  if (verifyBase.status !== 0) {
    return {
      base,
      head: headSha,
      error: `Failed to verify base revision "${base}": ${verifyBase.stderr}`
    };
  }

  return {
    base: verifyBase.stdout,
    head: headSha
  };
}

/**
 * Checks if package.json diff alters dependencies, devDependencies, peerDependencies, or scripts.
 */
export function isPackageJsonDependencyChanged(base: string, head: string, cwd: string = REPO_ROOT): boolean {
  try {
    const baseContent = runGit(['show', `${base}:package.json`], cwd);
    if (baseContent.status !== 0) {
      // If we cannot inspect base package.json, fail safe
      return true;
    }
    const currentPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(currentPath)) {
      return true;
    }
    const currentContent = fs.readFileSync(currentPath, 'utf8');

    const basePkg = JSON.parse(baseContent.stdout);
    const currPkg = JSON.parse(currentContent);

    const keysToCheck = ['dependencies', 'devDependencies', 'peerDependencies', 'scripts'] as const;
    for (const key of keysToCheck) {
      const baseObj = JSON.stringify(basePkg[key] || {});
      const currObj = JSON.stringify(currPkg[key] || {});
      if (baseObj !== currObj) {
        return true;
      }
    }
    return false;
  } catch {
    return true; // fail safe
  }
}

/**
 * Detects changed files using git diff and working tree status.
 */
export function detectChangedFiles(options: {
  base?: string;
  head?: string;
  cwd?: string;
}): {
  changedFiles: string[];
  baseSha: string;
  headSha: string;
  isFallback: boolean;
  fallbackReason?: string;
  packageJsonChangedDepsOrScripts: boolean;
} {
  const cwd = options.cwd || REPO_ROOT;
  const range = detectGitRange(options.base, options.head, cwd);

  if (range.error || !range.base) {
    return {
      changedFiles: [],
      baseSha: range.base || '',
      headSha: range.head || '',
      isFallback: true,
      fallbackReason: `Git range resolution failed: ${range.error || 'Unknown error'}`,
      packageJsonChangedDepsOrScripts: false
    };
  }

  const diffResult = runGit(['diff', '--name-only', range.base, range.head], cwd);
  if (diffResult.status !== 0) {
    return {
      changedFiles: [],
      baseSha: range.base,
      headSha: range.head,
      isFallback: true,
      fallbackReason: `git diff failed: ${diffResult.stderr}`,
      packageJsonChangedDepsOrScripts: false
    };
  }

  const changedSet = new Set<string>();
  for (const line of diffResult.stdout.split('\n')) {
    const trimmed = normalizePath(line.trim());
    if (trimmed) {
      changedSet.add(trimmed);
    }
  }

  // Also include uncommitted working tree changes if comparing against current workspace
  const isWorkingCopyDiff = !options.head || options.head === 'HEAD';
  if (isWorkingCopyDiff) {
    const uncommittedDiff = runGit(['diff', '--name-only', range.base], cwd);
    if (uncommittedDiff.status === 0 && uncommittedDiff.stdout) {
      for (const line of uncommittedDiff.stdout.split('\n')) {
        const trimmed = normalizePath(line.trim());
        if (trimmed) changedSet.add(trimmed);
      }
    }

    const statusResult = runGit(['status', '--porcelain'], cwd);
    if (statusResult.status === 0 && statusResult.stdout) {
      for (const line of statusResult.stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const filePath = normalizePath(trimmed.slice(3).trim());
        if (filePath) changedSet.add(filePath);
      }
    }
  }

  const changedFiles = Array.from(changedSet);
  let packageJsonChangedDepsOrScripts = false;
  if (changedFiles.includes('package.json')) {
    packageJsonChangedDepsOrScripts = isPackageJsonDependencyChanged(range.base, range.head, cwd);
  }

  return {
    changedFiles,
    baseSha: range.base,
    headSha: range.head,
    isFallback: false,
    packageJsonChangedDepsOrScripts
  };
}

/**
 * Resolves a module specifier to a relative repository file path.
 */
export function resolveModuleSpecifier(
  specifier: string,
  containingFilePath: string,
  rootDir: string = REPO_ROOT,
  fileExists: (p: string) => boolean = fs.existsSync
): string | null {
  if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('@/')) {
    return null;
  }

  let basePath: string;
  if (specifier.startsWith('@/')) {
    const sub = specifier.slice(2);
    basePath = path.resolve(rootDir, sub);
  } else {
    basePath = path.resolve(path.dirname(containingFilePath), specifier);
  }

  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.d.ts`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.js')
  ];

  if (basePath.endsWith('.js')) {
    candidates.push(basePath.replace(/\.js$/, '.ts'));
    candidates.push(basePath.replace(/\.js$/, '.tsx'));
  }

  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      try {
        const stat = fs.statSync(candidate);
        if (stat.isFile()) {
          const rel = path.relative(rootDir, candidate);
          return normalizePath(rel);
        }
      } catch {
        // continue
      }
    }
  }

  return null;
}

/**
 * Extracts top-level declarations with their 1-indexed line ranges from an AST source file.
 */
export function extractTopLevelDeclarations(sourceFile: ts.SourceFile): Map<string, AstDeclarationRange> {
  const declarations = new Map<string, AstDeclarationRange>();

  function record(name: string, node: ts.Node) {
    if (!name) return;
    const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    declarations.set(name, { name, startLine, endLine });
  }

  for (const stmt of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(stmt)) {
      record(stmt.name.text, stmt);
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      record(stmt.name.text, stmt);
    } else if (ts.isEnumDeclaration(stmt)) {
      record(stmt.name.text, stmt);
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      record(stmt.name.text, stmt);
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      record(stmt.name.text, stmt);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          record(decl.name.text, stmt);
        }
      }
    } else if (ts.isExportDeclaration(stmt)) {
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const elem of stmt.exportClause.elements) {
          const name = (elem.propertyName ?? elem.name).text;
          record(name, stmt);
        }
      }
    } else if (ts.isExportAssignment(stmt)) {
      record('default', stmt);
    }
  }

  return declarations;
}

/**
 * Extracts imported and exported module specifiers along with imported symbol names.
 */
export function extractModuleImports(
  sourceFile: ts.SourceFile,
  containingFilePath: string,
  rootDir: string = REPO_ROOT
): Array<{ target: string; symbols: Set<string> }> {
  const result: Array<{ target: string; symbols: Set<string> }> = [];

  function addImport(specifier: string, symbols: Set<string>) {
    const resolved = resolveModuleSpecifier(specifier, containingFilePath, rootDir);
    if (resolved) {
      result.push({ target: resolved, symbols });
    }
  }

  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const specifier = stmt.moduleSpecifier.text;
      const symbols = new Set<string>();

      if (stmt.importClause) {
        if (stmt.importClause.name) {
          symbols.add('default');
        }
        if (stmt.importClause.namedBindings) {
          if (ts.isNamedImports(stmt.importClause.namedBindings)) {
            for (const elem of stmt.importClause.namedBindings.elements) {
              symbols.add((elem.propertyName ?? elem.name).text);
            }
          } else if (ts.isNamespaceImport(stmt.importClause.namedBindings)) {
            symbols.add('*');
          }
        }
      } else {
        // Side effect import: import './foo'
        symbols.add('*');
      }

      addImport(specifier, symbols);
    } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const specifier = stmt.moduleSpecifier.text;
      const symbols = new Set<string>();

      if (!stmt.exportClause) {
        // export * from './foo'
        symbols.add('*');
      } else if (ts.isNamedExports(stmt.exportClause)) {
        for (const elem of stmt.exportClause.elements) {
          symbols.add((elem.propertyName ?? elem.name).text);
        }
      } else if (ts.isNamespaceExport(stmt.exportClause)) {
        symbols.add('*');
      }

      addImport(specifier, symbols);
    } else if (ts.isImportEqualsDeclaration(stmt) && ts.isExternalModuleReference(stmt.moduleReference)) {
      if (ts.isStringLiteral(stmt.moduleReference.expression)) {
        addImport(stmt.moduleReference.expression.text, new Set(['*']));
      }
    }
  }

  // Dynamic imports and require calls
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length > 0) {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg)) {
          addImport(arg.text, new Set(['*']));
        }
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length > 0) {
        const arg = node.arguments[0];
        if (ts.isStringLiteral(arg)) {
          addImport(arg.text, new Set(['*']));
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  return result;
}

/**
 * Discovers all source files and test files in the project.
 */
export function discoverProjectFiles(rootDir: string = REPO_ROOT): { sourceFiles: string[]; testFiles: string[] } {
  const sourceFiles: string[] = [];
  const testFiles: string[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
          walk(full);
        }
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        const rel = normalizePath(path.relative(rootDir, full));
        if (rel.startsWith('tests/')) {
          if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) {
            testFiles.push(rel);
          }
        } else if (rel.startsWith('src/')) {
          sourceFiles.push(rel);
        }
      }
    }
  }

  walk(path.join(rootDir, 'src'));
  walk(path.join(rootDir, 'tests'));

  return {
    sourceFiles: sourceFiles.sort(),
    testFiles: testFiles.sort()
  };
}

/**
 * Builds forward and reverse dependency graphs across the codebase using TypeScript AST.
 */
export function buildDependencyGraph(rootDir: string = REPO_ROOT): DependencyGraph {
  const { sourceFiles, testFiles } = discoverProjectFiles(rootDir);
  const allFiles = [...sourceFiles, ...testFiles];

  const forwardGraph = new Map<string, Set<string>>();
  const reverseGraph = new Map<string, Set<string>>();
  const importDetails = new Map<string, Map<string, Set<string>>>();
  const fileDeclarations = new Map<string, Map<string, AstDeclarationRange>>();

  for (const file of allFiles) {
    forwardGraph.set(file, new Set());
    if (!reverseGraph.has(file)) {
      reverseGraph.set(file, new Set());
    }
    importDetails.set(file, new Map());

    const fullPath = path.join(rootDir, file);
    if (!fs.existsSync(fullPath)) continue;

    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

    // Record top-level declarations
    const decls = extractTopLevelDeclarations(sf);
    fileDeclarations.set(file, decls);

    // Record imports
    const imports = extractModuleImports(sf, fullPath, rootDir);
    for (const { target, symbols } of imports) {
      forwardGraph.get(file)!.add(target);

      if (!reverseGraph.has(target)) {
        reverseGraph.set(target, new Set());
      }
      reverseGraph.get(target)!.add(file);

      const fileMap = importDetails.get(file)!;
      if (!fileMap.has(target)) {
        fileMap.set(target, new Set());
      }
      const existingSymbols = fileMap.get(target)!;
      for (const s of symbols) {
        existingSymbols.add(s);
      }
    }
  }

  return {
    forwardGraph,
    reverseGraph,
    importDetails,
    fileDeclarations,
    allTestFiles: testFiles
  };
}

/**
 * Parses unified diff hunks (git diff -U0) and maps changed lines to top-level AST declarations.
 */
export function extractChangedSymbolsFromDiff(
  diffOutput: string,
  headFileContent: string,
  baseFileContent?: string
): Set<string> {
  const changedSymbols = new Set<string>();

  if (!diffOutput.trim()) {
    return changedSymbols;
  }

  const headSf = ts.createSourceFile('head.ts', headFileContent, ts.ScriptTarget.Latest, true);
  const headDecls = extractTopLevelDeclarations(headSf);

  let baseDecls: Map<string, AstDeclarationRange> | null = null;
  if (baseFileContent) {
    try {
      const baseSf = ts.createSourceFile('base.ts', baseFileContent, ts.ScriptTarget.Latest, true);
      baseDecls = extractTopLevelDeclarations(baseSf);
    } catch {
      baseDecls = null;
    }
  }

  const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
  let match: RegExpExecArray | null;
  let parsedAnyHunk = false;

  while ((match = hunkRegex.exec(diffOutput)) !== null) {
    parsedAnyHunk = true;
    const oldStart = parseInt(match[1], 10);
    const oldCount = match[2] !== undefined ? parseInt(match[2], 10) : 1;
    const newStart = parseInt(match[3], 10);
    const newCount = match[4] !== undefined ? parseInt(match[4], 10) : 1;

    let matchedDeclaration = false;

    if (newCount > 0) {
      const hunkNewStart = newStart;
      const hunkNewEnd = newStart + newCount - 1;

      for (const [name, range] of headDecls.entries()) {
        if (range.startLine <= hunkNewEnd && range.endLine >= hunkNewStart) {
          changedSymbols.add(name);
          matchedDeclaration = true;
        }
      }
    }

    if (newCount === 0) {
      // Pure deletion in head
      for (const [name, range] of headDecls.entries()) {
        if (range.startLine <= newStart && range.endLine >= newStart) {
          changedSymbols.add(name);
          matchedDeclaration = true;
        }
      }
      if (baseDecls && oldCount > 0) {
        const hunkOldStart = oldStart;
        const hunkOldEnd = oldStart + oldCount - 1;
        for (const [name, range] of baseDecls.entries()) {
          if (range.startLine <= hunkOldEnd && range.endLine >= hunkOldStart) {
            changedSymbols.add(name);
            matchedDeclaration = true;
          }
        }
      }
    }

    if (!matchedDeclaration) {
      // Change outside any named top-level declaration -> safe fail-open for this file
      changedSymbols.add('*');
    }
  }

  if (!parsedAnyHunk) {
    // If diff has content but couldn't parse hunks, mark all dirty
    changedSymbols.add('*');
  }

  return changedSymbols;
}

/**
 * Extracts changed symbols for high-churn integration files (src/types.ts and src/lib/persistence.ts).
 */
export function getChangedSymbols(
  filePath: string,
  base: string,
  head: string = 'HEAD',
  cwd: string = REPO_ROOT
): Set<string> {
  const norm = normalizePath(filePath);
  const diffResult = runGit(['diff', '-U0', base, head, '--', norm], cwd);

  if (diffResult.status !== 0) {
    return new Set(['*']);
  }

  const headPath = path.join(cwd, norm);
  if (!fs.existsSync(headPath)) {
    return new Set(['*']);
  }

  let headContent = '';
  try {
    headContent = fs.readFileSync(headPath, 'utf8');
  } catch {
    return new Set(['*']);
  }

  let baseContent: string | undefined;
  const baseShow = runGit(['show', `${base}:${norm}`], cwd);
  if (baseShow.status === 0 && baseShow.stdout) {
    baseContent = baseShow.stdout;
  }

  return extractChangedSymbolsFromDiff(diffResult.stdout, headContent, baseContent);
}

/**
 * Main selection algorithm: selects impacted tests given changed files, graph, and configs.
 */
export function selectImpactedTests(options: ImpactSelectionOptions): ImpactSelectionResult {
  const baseSha = options.baseSha || 'unknown';
  const headSha = options.headSha || 'unknown';
  const changedFiles = options.changedFiles.map(normalizePath);

  const graph = options.dependencyGraph || buildDependencyGraph(REPO_ROOT);
  const allTests = graph.allTestFiles;

  // 1. Smoke-only execution mode
  if (options.smokeOnly) {
    const smokeSelected = SMOKE_TESTS.filter(t => fs.existsSync(path.join(REPO_ROOT, t)));
    const testReasons: Record<string, string[]> = {};
    for (const t of smokeSelected) {
      testReasons[t] = ['Smoke suite mode'];
    }
    return {
      baseSha,
      headSha,
      changedFiles,
      selectedTests: smokeSelected,
      testReasons,
      smokeTests: SMOKE_TESTS,
      totalAvailableTests: allTests.length,
      isFallback: false,
      isDatabaseAffected: false
    };
  }

  const directTests = changedFiles.filter(f => f.startsWith('tests/') && (f.endsWith('.test.ts') || f.endsWith('.test.tsx')));
  const fallbackTestSet = Array.from(new Set([...allTests, ...directTests])).sort();

  // 2. Pre-existing fallback check
  if (options.isFallback) {
    const testReasons: Record<string, string[]> = {};
    for (const t of fallbackTestSet) {
      testReasons[t] = [options.fallbackReason || 'Full regression fallback'];
    }
    return {
      baseSha,
      headSha,
      changedFiles,
      selectedTests: fallbackTestSet,
      testReasons,
      smokeTests: SMOKE_TESTS,
      totalAvailableTests: allTests.length,
      isFallback: true,
      fallbackReason: options.fallbackReason,
      isDatabaseAffected: changedFiles.some(isDatabaseAffectedFile)
    };
  }

  // 3. Fallback triggers from changed file patterns
  for (const f of changedFiles) {
    for (const pattern of FALLBACK_FILE_PATTERNS) {
      if (matchesPattern(f, pattern)) {
        const reason = `Matched fallback file pattern: ${pattern}`;
        const testReasons: Record<string, string[]> = {};
        for (const t of fallbackTestSet) {
          testReasons[t] = [reason];
        }
        return {
          baseSha,
          headSha,
          changedFiles,
          selectedTests: fallbackTestSet,
          testReasons,
          smokeTests: SMOKE_TESTS,
          totalAvailableTests: allTests.length,
          isFallback: true,
          fallbackReason: reason,
          isDatabaseAffected: changedFiles.some(isDatabaseAffectedFile)
        };
      }
    }
  }

  // 4. Fallback trigger from package.json dependencies/scripts
  if (options.packageJsonChangedDepsOrScripts) {
    const reason = 'package.json dependencies or scripts modified';
    const testReasons: Record<string, string[]> = {};
    for (const t of fallbackTestSet) {
      testReasons[t] = [reason];
    }
    return {
      baseSha,
      headSha,
      changedFiles,
      selectedTests: fallbackTestSet,
      testReasons,
      smokeTests: SMOKE_TESTS,
      totalAvailableTests: allTests.length,
      isFallback: true,
      fallbackReason: reason,
      isDatabaseAffected: changedFiles.some(isDatabaseAffectedFile)
    };
  }

  // 5. Symbol granular map preparation
  const changedSymbolsMap = options.changedSymbolsMap || new Map<string, Set<string>>();
  for (const granularFile of SYMBOL_GRANULAR_FILES) {
    if (changedFiles.includes(granularFile) && !changedSymbolsMap.has(granularFile)) {
      const symbols = getChangedSymbols(granularFile, baseSha, headSha, REPO_ROOT);
      changedSymbolsMap.set(granularFile, symbols);
    }
  }

  const selectedTestsMap = new Map<string, string[]>();
  const affectedFiles = new Set<string>();
  const queue: string[] = [];

  function addSelectedTest(testFile: string, reason: string) {
    const norm = normalizePath(testFile);
    if (!selectedTestsMap.has(norm)) {
      selectedTestsMap.set(norm, []);
    }
    const reasons = selectedTestsMap.get(norm)!;
    if (!reasons.includes(reason)) {
      reasons.push(reason);
    }
  }

  // Step 1: Direct test file changes
  for (const f of changedFiles) {
    if (f.startsWith('tests/') && (f.endsWith('.test.ts') || f.endsWith('.test.tsx'))) {
      addSelectedTest(f, 'Direct test file modification');
      affectedFiles.add(f);
    } else {
      affectedFiles.add(f);
      queue.push(f);
    }
  }

  // Step 2: Transitive dependency graph traversal
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const consumers = graph.reverseGraph.get(curr) || new Set();

    for (const consumer of consumers) {
      if (affectedFiles.has(consumer)) continue;

      // Symbol-level filtering for src/types.ts and src/lib/persistence.ts
      if (SYMBOL_GRANULAR_FILES.has(curr)) {
        const changedSymbols = changedSymbolsMap.get(curr);
        if (changedSymbols && changedSymbols.size > 0) {
          const consumerImports = graph.importDetails.get(consumer)?.get(curr) || new Set();
          const hasWildcard = consumerImports.has('*');
          const hasSymbolOverlap = Array.from(consumerImports).some(s =>
            changedSymbols.has(s) || changedSymbols.has('*')
          );

          if (!hasWildcard && !hasSymbolOverlap) {
            // Consumer does NOT import any changed symbols from this granular file!
            continue;
          }
        }
      }

      affectedFiles.add(consumer);
      queue.push(consumer);

      if (consumer.startsWith('tests/') && (consumer.endsWith('.test.ts') || consumer.endsWith('.test.tsx'))) {
        addSelectedTest(consumer, `Transitive dependency consumer of ${curr}`);
      }
    }
  }

  // Step 3: Static Contract Mappings
  for (const [pattern, mappedTests] of Object.entries(STATIC_CONTRACT_MAPPINGS)) {
    for (const changedFile of changedFiles) {
      if (matchesPattern(changedFile, pattern)) {
        for (const testFile of mappedTests) {
          addSelectedTest(testFile, `Static contract rule for ${pattern} (${changedFile})`);
        }
      }
    }
  }

  // Step 4: Permanent Smoke Suite
  for (const smokeTest of SMOKE_TESTS) {
    addSelectedTest(smokeTest, 'Permanent smoke suite test');
  }

  // Step 5: Filter to existing test files (unless skipDiskCheck is true)
  const candidateTests = Array.from(selectedTestsMap.keys());
  const existingSelected = options.skipDiskCheck
    ? candidateTests
    : candidateTests.filter(t => fs.existsSync(path.join(REPO_ROOT, t)));

  // Step 6: Fallback Ratio Threshold Check
  const totalAvailable = allTests.length;
  const ratio = totalAvailable > 0 ? existingSelected.length / totalAvailable : 0;

  if (totalAvailable > 0 && ratio > FALLBACK_RATIO_THRESHOLD) {
    const fallbackReason = `Selected tests ratio ${(ratio * 100).toFixed(1)}% exceeded fallback threshold ${(FALLBACK_RATIO_THRESHOLD * 100).toFixed(1)}%`;
    const fullTestSet = Array.from(new Set([...allTests, ...existingSelected])).sort();
    const testReasons: Record<string, string[]> = {};
    for (const t of fullTestSet) {
      testReasons[t] = [fallbackReason];
    }
    return {
      baseSha,
      headSha,
      changedFiles,
      selectedTests: fullTestSet,
      testReasons,
      smokeTests: SMOKE_TESTS,
      totalAvailableTests: totalAvailable,
      isFallback: true,
      fallbackReason,
      isDatabaseAffected: changedFiles.some(isDatabaseAffectedFile)
    };
  }

  const finalReasons: Record<string, string[]> = {};
  for (const t of existingSelected) {
    finalReasons[t] = selectedTestsMap.get(t) || [];
  }

  return {
    baseSha,
    headSha,
    changedFiles,
    selectedTests: existingSelected.sort(),
    testReasons: finalReasons,
    smokeTests: SMOKE_TESTS,
    totalAvailableTests: totalAvailable,
    isFallback: false,
    isDatabaseAffected: changedFiles.some(isDatabaseAffectedFile)
  };
}

/**
 * Formats a clean human-readable summary for console output.
 */
export function formatConsoleSummary(result: ImpactSelectionResult): string {
  const lines: string[] = [];
  lines.push('============================================================');
  lines.push('🎯 Engoryx Impact-Based Test Selector');
  lines.push('============================================================');
  lines.push(`Base Commit   : ${result.baseSha.slice(0, 10)}`);
  lines.push(`Head Commit   : ${result.headSha.slice(0, 10)}`);
  lines.push(`Changed Files : ${result.changedFiles.length}`);
  lines.push(`Database DB/RLS: ${result.isDatabaseAffected ? '⚠️  AFFECTED' : '✅ Unaffected'}`);
  lines.push(`Fallback Suite: ${result.isFallback ? `⚠️  TRIGGERED (${result.fallbackReason})` : '✅ Selective'}`);
  lines.push(`Total Tests   : ${result.totalAvailableTests}`);
  const pct = result.totalAvailableTests > 0
    ? ((result.selectedTests.length / result.totalAvailableTests) * 100).toFixed(1)
    : '0.0';
  lines.push(`Selected Tests: ${result.selectedTests.length} (${pct}%)`);
  lines.push('------------------------------------------------------------');

  if (result.selectedTests.length > 0) {
    lines.push('Selected Test Files:');
    for (const testFile of result.selectedTests) {
      const reasons = result.testReasons[testFile] || [];
      const isSmoke = reasons.includes('Permanent smoke suite test') || reasons.includes('Smoke suite mode');
      const tag = isSmoke ? '[SMOKE]' : '[IMPACT]';
      lines.push(`  • ${tag.padEnd(8)} ${testFile} (${reasons.join('; ')})`);
    }
  } else {
    lines.push('No test files selected.');
  }
  lines.push('============================================================');

  return lines.join('\n');
}

/**
 * Writes markdown summary to GITHUB_STEP_SUMMARY if available.
 */
export function writeGitHubStepSummary(result: ImpactSelectionResult): void {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryFile) return;

  const pct = result.totalAvailableTests > 0
    ? ((result.selectedTests.length / result.totalAvailableTests) * 100).toFixed(1)
    : '0.0';

  const mdLines = [
    '### 🎯 Engoryx Impact-Based Test Selection Summary',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| **Base Commit** | \`${result.baseSha}\` |`,
    `| **Head Commit** | \`${result.headSha}\` |`,
    `| **Changed Files** | ${result.changedFiles.length} |`,
    `| **Database / Migrations** | ${result.isDatabaseAffected ? '⚠️ **Affected**' : '✅ Unaffected'} |`,
    `| **Fallback Full Suite** | ${result.isFallback ? `⚠️ **Triggered** (${result.fallbackReason})` : '✅ Selective'} |`,
    `| **Selected Tests** | **${result.selectedTests.length}** / ${result.totalAvailableTests} (${pct}%) |`,
    '',
    '<details><summary><b>Selected Tests (' + result.selectedTests.length + ')</b></summary>',
    '',
    '| Test File | Selection Rationale |',
    '| --- | --- |',
    ...result.selectedTests.map(t => `| \`${t}\` | ${(result.testReasons[t] || []).join('<br>')} |`),
    '',
    '</details>',
    '',
    '<details><summary><b>Changed Files (' + result.changedFiles.length + ')</b></summary>',
    '',
    ...result.changedFiles.map(f => `- \`${f}\``),
    '',
    '</details>',
    ''
  ];

  try {
    fs.appendFileSync(summaryFile, mdLines.join('\n'), 'utf8');
  } catch (err) {
    console.error('Failed to write to GITHUB_STEP_SUMMARY:', err);
  }
}

/**
 * Executes the selected test suite using node's test runner.
 */
export function executeSelectedTests(
  testFiles: string[],
  cwd: string = REPO_ROOT,
  isFallback: boolean = false
): number {
  if (testFiles.length === 0) {
    console.log('No tests to run.');
    return 0;
  }

  if (isFallback) {
    console.log('\n🚀 Executing full regression suite via the repository npm test contract...\n');
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npmCommand, ['test'], {
      cwd,
      stdio: 'inherit',
      shell: false
    });
    return result.status ?? (result.error ? 1 : 0);
  }

  const hasTsx = testFiles.some(f => f.endsWith('.tsx'));
  const nodeArgs = [
    '--test',
    '--test-concurrency=1',
    '--experimental-strip-types'
  ];

  if (hasTsx) {
    nodeArgs.push('--import', 'tsx');
  }

  nodeArgs.push(...testFiles);

  console.log(`\n🚀 Executing ${testFiles.length} selected tests with node:test...\n`);
  const result = spawnSync('node', nodeArgs, {
    cwd,
    stdio: 'inherit',
    shell: false
  });

  return result.status ?? (result.error ? 1 : 0);
}

/**
 * CLI Entry point
 */
export async function runImpactSelectorCli(args: string[] = process.argv.slice(2)): Promise<void> {
  const isSmoke = args.includes('--smoke');
  const isRun = args.includes('--run');
  const isJson = args.includes('--json');
  const isGitHubSummary = args.includes('--github-summary') || !!process.env.GITHUB_STEP_SUMMARY;

  let baseArg: string | undefined;
  let headArg: string | undefined;

  const baseIdx = args.indexOf('--base');
  if (baseIdx !== -1 && baseIdx + 1 < args.length) {
    baseArg = args[baseIdx + 1];
  }

  const headIdx = args.indexOf('--head');
  if (headIdx !== -1 && headIdx + 1 < args.length) {
    headArg = args[headIdx + 1];
  }

  let result: ImpactSelectionResult;

  if (isSmoke) {
    result = selectImpactedTests({
      changedFiles: [],
      smokeOnly: true
    });
  } else {
    const diffInfo = detectChangedFiles({
      base: baseArg,
      head: headArg,
      cwd: REPO_ROOT
    });

    result = selectImpactedTests({
      changedFiles: diffInfo.changedFiles,
      baseSha: diffInfo.baseSha,
      headSha: diffInfo.headSha,
      isFallback: diffInfo.isFallback,
      fallbackReason: diffInfo.fallbackReason,
      packageJsonChangedDepsOrScripts: diffInfo.packageJsonChangedDepsOrScripts
    });
  }

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatConsoleSummary(result));
  }

  if (isGitHubSummary) {
    writeGitHubStepSummary(result);
  }

  if (isRun) {
    const exitCode = executeSelectedTests(result.selectedTests, REPO_ROOT, result.isFallback);
    process.exit(exitCode);
  }
}

// Auto-run when executed directly
if (['test-impact.ts', 'test-impact.js'].includes(path.basename(process.argv[1] || ''))) {
  runImpactSelectorCli().catch(err => {
    console.error('Test impact selector failed:', err);
    process.exit(1);
  });
}
