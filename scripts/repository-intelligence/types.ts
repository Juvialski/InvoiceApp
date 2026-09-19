export const REPOSITORY_INTELLIGENCE_INDEX_SCHEMA_VERSION = 1 as const;
export const REPOSITORY_INTELLIGENCE_GENERATOR_VERSION = "ri-1.0.0" as const;

export type RepositoryIndexMode = "full" | "incremental";

export type FileClassification =
  | "source"
  | "test"
  | "script"
  | "documentation"
  | "migration"
  | "generated"
  | "vendor"
  | "cache"
  | "excluded";

export type FileLanguage =
  | "typescript"
  | "tsx"
  | "javascript"
  | "jsx"
  | "json"
  | "sql"
  | "markdown"
  | "yaml"
  | "css"
  | "html"
  | "text"
  | "binary"
  | "unknown";

export interface FileClassificationResult {
  readonly classification: FileClassification;
  readonly eligible: boolean;
  readonly language: FileLanguage;
  readonly exclusionReason?: string;
}

export interface TrackedFileCandidate {
  readonly path: string;
  readonly absolutePath: string;
  readonly classification: FileClassification;
  readonly language: FileLanguage;
  readonly size: number;
  readonly contentHash?: string;
  readonly lineCount?: number;
  readonly contents?: Buffer;
  readonly exclusionReason?: string;
}

export interface IndexedSourceSpan {
  readonly startLine: number;
  readonly endLine: number;
  readonly startColumn: number;
  readonly endColumn: number;
}

export type IndexedSymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "namespace"
  | "const"
  | "let"
  | "var"
  | "method"
  | "constructor"
  | "property";

export interface IndexedSymbol {
  readonly id: string;
  readonly name: string;
  readonly qualifiedName: string;
  readonly kind: IndexedSymbolKind;
  readonly isExported: boolean;
  readonly sourceSpan?: IndexedSourceSpan;
}

export interface IndexedImport {
  readonly moduleSpecifier: string;
  readonly importedNames: readonly string[];
  readonly isTypeOnly: boolean;
}

export type IndexedExportKind = "local" | "default" | "re-export";

export interface IndexedExport {
  readonly name: string;
  readonly exportedName: string;
  readonly kind: IndexedExportKind;
  readonly moduleSpecifier?: string;
  readonly isTypeOnly: boolean;
}

export interface FileIndexRecord {
  readonly schemaVersion: number;
  readonly generatorVersion: string;
  readonly path: string;
  readonly classification: Exclude<FileClassification, "generated" | "vendor" | "cache" | "excluded">;
  readonly language: FileLanguage;
  readonly size: number;
  readonly lineCount: number;
  readonly contentHash: string;
  readonly symbols: readonly IndexedSymbol[];
  readonly imports: readonly IndexedImport[];
  readonly exports: readonly IndexedExport[];
  readonly reExports: readonly IndexedExport[];
}

export interface ExcludedFileRecord {
  readonly path: string;
  readonly classification: Exclude<FileClassification, "source" | "test" | "script" | "documentation" | "migration">;
  readonly language: FileLanguage;
  readonly size: number;
  readonly reason: string;
}

export interface RepositoryIndex {
  readonly schemaVersion: number;
  readonly generatorVersion: string;
  readonly repositoryHeadSha: string;
  readonly files: readonly FileIndexRecord[];
  readonly excludedFiles: readonly ExcludedFileRecord[];
}

export interface CacheManifestFile {
  readonly path: string;
  readonly contentHash: string;
  readonly recordFile: string;
}

export interface RepositoryIndexCacheManifest {
  readonly schemaVersion: number;
  readonly generatorVersion: string;
  readonly repositoryHeadSha: string;
  readonly files: readonly CacheManifestFile[];
}

export interface IndexRunSummary {
  readonly requestedMode: RepositoryIndexMode;
  readonly mode: RepositoryIndexMode;
  readonly trackedFiles: number;
  readonly eligibleFiles: number;
  readonly excludedFiles: number;
  readonly reparsed: number;
  readonly reused: number;
  readonly added: number;
  readonly modified: number;
  readonly hashChanged: number;
  readonly renamed: number;
  readonly deleted: number;
  readonly cacheMissing: boolean;
  readonly cacheRecovered: boolean;
  readonly cacheInvalidated: boolean;
  readonly reparsedPaths: readonly string[];
  readonly reusedPaths: readonly string[];
  readonly renamedPaths: readonly string[];
  readonly deletedPaths: readonly string[];
  readonly elapsedMs: number;
}

export interface RepositoryIndexResult {
  readonly index: RepositoryIndex;
  readonly summary: IndexRunSummary;
  readonly cacheDirectory: string;
}

export interface BuildRepositoryIndexOptions {
  readonly rootDir: string;
  readonly cacheDir?: string;
  readonly mode?: RepositoryIndexMode;
  readonly schemaVersion?: number;
  readonly generatorVersion?: string;
}
