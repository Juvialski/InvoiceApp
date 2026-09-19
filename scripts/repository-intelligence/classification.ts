import path from "node:path";
import type { FileClassificationResult, FileLanguage } from "./types.ts";

export function normalizeRepositoryPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

export function languageForPath(relativePath: string): FileLanguage {
  const extension = path.posix.extname(normalizeRepositoryPath(relativePath)).toLowerCase();
  if (extension === ".ts") return "typescript";
  if (extension === ".tsx") return "tsx";
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return "javascript";
  if (extension === ".jsx") return "jsx";
  if (extension === ".json" || extension === ".jsonc") return "json";
  if (extension === ".sql") return "sql";
  if (extension === ".md" || extension === ".mdx") return "markdown";
  if (extension === ".yaml" || extension === ".yml") return "yaml";
  if (extension === ".css" || extension === ".scss" || extension === ".less") return "css";
  if (extension === ".html" || extension === ".htm") return "html";
  if ([".txt", ".csv", ".toml", ".ini", ".xml"].includes(extension)) return "text";
  if ([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".pdf", ".doc", ".docx",
    ".xls", ".xlsx", ".zip", ".gz", ".tar", ".7z", ".woff", ".woff2", ".ttf", ".otf",
    ".mp3", ".mp4", ".mov", ".avi", ".wasm", ".bin", ".key", ".pem", ".p12", ".pfx",
    ".crt", ".cer", ".der",
  ].includes(extension)) return "binary";
  return "unknown";
}

function isEnvironmentPath(baseName: string): boolean {
  return baseName === ".env" || baseName.startsWith(".env.");
}

function isSecretLikePath(relativePath: string): boolean {
  const normalized = normalizeRepositoryPath(relativePath).toLowerCase();
  const segments = normalized.split("/");
  const baseName = segments.at(-1) || "";
  const extension = path.posix.extname(baseName);

  if (isEnvironmentPath(baseName)) return true;
  if ([".pem", ".key", ".p12", ".pfx", ".crt", ".cer", ".der"].includes(extension)) return true;
  if (segments.some((segment) => ["secrets", "credentials", "private-keys"].includes(segment))) return true;
  if (/^(credentials?|secrets?|tokens?|api[-_]?keys?|service[-_]?account|private[-_]?key)(?:[._-].*)?$/.test(baseName)) return true;
  if (/(?:credentials?|secrets?|api[-_]?keys?|service[-_]?account|private[-_]?key)\.(?:json|ya?ml|toml|ini|txt)$/.test(baseName)) return true;
  return false;
}

function pathHasSegment(relativePath: string, values: readonly string[]): boolean {
  const segments = normalizeRepositoryPath(relativePath).toLowerCase().split("/");
  return segments.some((segment) => values.includes(segment));
}

export function classifyTrackedPath(relativePath: string): FileClassificationResult {
  const normalized = normalizeRepositoryPath(relativePath);
  const lower = normalized.toLowerCase();
  const baseName = path.posix.basename(lower);
  const language = languageForPath(normalized);

  if (isSecretLikePath(normalized)) {
    return { classification: "excluded", eligible: false, language, exclusionReason: "secret-like path" };
  }
  if (pathHasSegment(normalized, ["node_modules", "vendor", "third_party", ".pnpm"])) {
    return { classification: "vendor", eligible: false, language, exclusionReason: "vendor or dependency path" };
  }
  if (pathHasSegment(normalized, ["dist", "build", "generated"]) || /(?:\.generated|\.gen)\.[^.]+$/.test(baseName)) {
    return { classification: "generated", eligible: false, language, exclusionReason: "generated artifact path" };
  }
  if (pathHasSegment(normalized, ["coverage", ".cache", ".turbo", ".vite", ".qa-e2e", ".worktrees", "tmp", ".tmp", "artifacts", "downloads", "uploads"])) {
    return { classification: "cache", eligible: false, language, exclusionReason: "cache, temporary, or downloaded artifact path" };
  }
  if (language === "binary") {
    return { classification: "generated", eligible: false, language, exclusionReason: "binary artifact" };
  }
  if (normalized.startsWith("tests/") || normalized.startsWith("__tests__/") || normalized.includes("/__tests__/") || /(?:\.test|\.spec)\.[^.]+$/.test(baseName)) {
    return { classification: "test", eligible: true, language };
  }
  if (normalized.startsWith("scripts/") || normalized.startsWith("tools/") || normalized.startsWith("bin/") || /(?:^|\.)config\.[^.]+$/.test(baseName)) {
    return { classification: "script", eligible: true, language };
  }
  if (normalized.startsWith("docs/") || ["markdown"].includes(language)) {
    return { classification: "documentation", eligible: true, language };
  }
  if (language === "sql" || pathHasSegment(normalized, ["migrations"])) {
    return { classification: "migration", eligible: true, language };
  }
  return { classification: "source", eligible: true, language };
}
