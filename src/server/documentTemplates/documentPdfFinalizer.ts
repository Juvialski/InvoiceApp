import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DOCX_MIME_TYPE,
  extractDocxMergeTags,
  validateDocxTemplateBytes,
} from "./documentTemplateEngine.ts";

export const PDF_MIME_TYPE = "application/pdf";
export const MAX_FINALIZED_PDF_BYTES = 25 * 1024 * 1024;
export const DOCUMENT_PDF_TEMP_PREFIX = "hydroqualisense-pdf-";
export const DOCUMENT_PDF_CONVERTER_PATH_ENV = "DOCUMENT_PDF_CONVERTER_PATH";
export const DOCUMENT_PDF_CONVERTER_TIMEOUT_ENV = "DOCUMENT_PDF_CONVERTER_TIMEOUT_MS";
export const DOCUMENT_PDF_UNAVAILABLE_MESSAGE = "High-fidelity PDF conversion is unavailable on this deployment. Use the existing programmatic PDF fallback for final PDF output.";

const DEFAULT_CONVERTER_TIMEOUT_MS = 45_000;
const MAX_CONVERTER_TIMEOUT_MS = 120_000;
const CAPABILITY_TIMEOUT_MS = 5_000;
const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024;

export type DocumentPdfFinalizationStatus = "AVAILABLE" | "UNAVAILABLE";

export interface DocumentPdfFinalizationHealth {
  readonly status: DocumentPdfFinalizationStatus;
  readonly converterId?: "libreoffice";
  readonly converterVersion?: string;
  readonly message: string;
}

export interface DocumentPdfConverter {
  readonly id: "libreoffice" | "test";
  readonly version: string;
  convert(input: { readonly docxBytes: Uint8Array }): Promise<Uint8Array>;
}

export class DocumentPdfFinalizationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 503) {
    super(message);
    this.name = "DocumentPdfFinalizationError";
    this.code = code;
    this.status = status;
  }
}

interface ProcessResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly outputTooLarge: boolean;
  readonly spawnError?: Error;
}

interface ProbeResult extends DocumentPdfFinalizationHealth {
  readonly executable?: string;
}

const healthCache = new Map<string, { expiresAt: number; result: ProbeResult }>();

function timeoutFromEnv(env: Readonly<Record<string, string | undefined>>): number {
  const value = Number(env[DOCUMENT_PDF_CONVERTER_TIMEOUT_ENV] || "");
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_CONVERTER_TIMEOUT_MS;
  return Math.max(1_000, Math.min(MAX_CONVERTER_TIMEOUT_MS, Math.floor(value)));
}

function converterCandidates(env: Readonly<Record<string, string | undefined>>): readonly string[] {
  const configured = String(env[DOCUMENT_PDF_CONVERTER_PATH_ENV] || "").trim();
  if (configured) {
    if (configured.includes("\0")) return [];
    // The command is always passed to spawn with shell:false. Rejecting
    // command-shaped values as well keeps the operator setting a path or a
    // single executable name rather than smuggling in shell arguments.
    if (configured.includes("\n") || configured.includes("\r") || configured.includes("\t")) return [];
    if (isAbsolute(configured) || /^[A-Za-z0-9._-]+(?:\.exe)?$/i.test(configured)) return [configured];
    return [];
  }
  return process.platform === "win32"
    ? ["soffice.exe", "libreoffice.exe", "soffice", "libreoffice"]
    : ["soffice", "libreoffice"];
}

function safeVersion(value: string): string {
  const normalized = value
    .replace(/[^A-Za-z0-9._+() -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return normalized || "unknown";
}

function versionFromOutput(stdout: string, stderr: string): string | null {
  const line = `${stdout}\n${stderr}`.split(/\r?\n/).map((value) => value.trim()).find(Boolean) || "";
  const match = /LibreOffice\s+([0-9][A-Za-z0-9._+-]*)/i.exec(line);
  return match ? safeVersion(`LibreOffice ${match[1]}`) : null;
}

function killChild(child: ReturnType<typeof spawn>): void {
  try {
    if (child.killed) return;
    if (child.pid && process.platform === "win32") {
      const treeKiller = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        shell: false,
        windowsHide: true,
        stdio: "ignore",
      });
      treeKiller.unref();
      return;
    }
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
        return;
      } catch { /* fall through to the direct child handle */ }
    }
    child.kill("SIGKILL");
  } catch {
    try { child.kill(); } catch { /* best-effort process cleanup */ }
  }
}

function appendOutput(current: string, chunk: Buffer): string {
  if (current.length >= MAX_PROCESS_OUTPUT_BYTES) return current;
  const remaining = MAX_PROCESS_OUTPUT_BYTES - current.length;
  const text = chunk.toString("utf8");
  return current + text.slice(0, remaining);
}

function runProcess(
  executable: string,
  args: readonly string[],
  timeoutMs: number,
  outputPath?: string,
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let outputTooLarge = false;
    let spawnError: Error | undefined;
    let finished = false;
    let timer: NodeJS.Timeout | undefined;
    let sizeTimer: NodeJS.Timeout | undefined;
    const child = spawn(executable, [...args], {
      detached: process.platform !== "win32",
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      if (sizeTimer) clearInterval(sizeTimer);
      resolve({ code, signal, stdout, stderr, timedOut, outputTooLarge, ...(spawnError ? { spawnError } : {}) });
    };
    child.stdout?.on("data", (chunk: Buffer) => { stdout = appendOutput(stdout, chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = appendOutput(stderr, chunk); });
    child.once("error", (error) => { spawnError = error instanceof Error ? error : new Error("Converter process could not start."); });
    child.once("close", (code, signal) => finish(code, signal));
    timer = setTimeout(() => {
      timedOut = true;
      killChild(child);
    }, timeoutMs);
    sizeTimer = outputPath ? setInterval(() => {
      void stat(outputPath).then((details) => {
        if (details.size > MAX_FINALIZED_PDF_BYTES) {
          outputTooLarge = true;
          killChild(child);
        }
      }).catch(() => { /* the converter may not have created output yet */ });
    }, 100) : undefined;
  });
}

function converterArgs(profilePath: string, extra: readonly string[]): string[] {
  return [
    "--headless",
    "--invisible",
    "--nodefault",
    "--nologo",
    "--nolockcheck",
    "--nofirststartwizard",
    `-env:UserInstallation=${pathToFileURL(profilePath).href}`,
    ...extra,
  ];
}

async function probeConverter(executable: string): Promise<ProbeResult> {
  let directory = "";
  try {
    directory = await mkdtemp(join(tmpdir(), `${DOCUMENT_PDF_TEMP_PREFIX}probe-`));
    const profilePath = join(directory, "profile");
    await mkdir(profilePath);
    const result = await runProcess(executable, converterArgs(profilePath, ["--version"]), CAPABILITY_TIMEOUT_MS);
    if (result.timedOut || result.code !== 0 || result.spawnError) {
      return { status: "UNAVAILABLE", message: DOCUMENT_PDF_UNAVAILABLE_MESSAGE };
    }
    const converterVersion = versionFromOutput(result.stdout, result.stderr);
    if (!converterVersion) return { status: "UNAVAILABLE", message: DOCUMENT_PDF_UNAVAILABLE_MESSAGE };
    return {
      status: "AVAILABLE",
      converterId: "libreoffice",
      converterVersion,
      message: "High-fidelity PDF conversion is operational on this deployment.",
      executable,
    };
  } catch {
    return { status: "UNAVAILABLE", message: DOCUMENT_PDF_UNAVAILABLE_MESSAGE };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 2 }).catch(() => {});
  }
}

async function probeConverterWithCache(env: Readonly<Record<string, string | undefined>>): Promise<ProbeResult> {
  const key = `${process.platform}|${String(env[DOCUMENT_PDF_CONVERTER_PATH_ENV] || "")}`;
  const cached = healthCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  let result: ProbeResult = { status: "UNAVAILABLE", message: DOCUMENT_PDF_UNAVAILABLE_MESSAGE };
  for (const executable of converterCandidates(env)) {
    const candidate = await probeConverter(executable);
    if (candidate.status === "AVAILABLE") {
      result = candidate;
      break;
    }
  }
  healthCache.set(key, { expiresAt: Date.now() + 30_000, result });
  return result;
}

export function clearDocumentPdfFinalizationHealthCache(): void {
  healthCache.clear();
}

export async function getDocumentPdfFinalizationHealth(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<DocumentPdfFinalizationHealth> {
  const result = await probeConverterWithCache(env);
  const { executable: _executable, ...health } = result;
  return health;
}

export class LibreOfficePdfConverter implements DocumentPdfConverter {
  readonly id = "libreoffice" as const;
  private readonly executable: string;
  readonly version: string;
  private readonly timeoutMs: number;

  constructor(
    executable: string,
    version: string,
    timeoutMs = DEFAULT_CONVERTER_TIMEOUT_MS,
  ) {
    this.executable = executable;
    this.version = version;
    this.timeoutMs = timeoutMs;
  }

  async convert(input: { readonly docxBytes: Uint8Array }): Promise<Uint8Array> {
    try {
      validateDocxTemplateBytes(input.docxBytes, "merged.docx", DOCX_MIME_TYPE);
      if (extractDocxMergeTags(input.docxBytes, "merged.docx").length) {
        throw new DocumentPdfFinalizationError("UNRESOLVED_MERGE_TAGS", "The merged Word document still contains unresolved fields.", 422);
      }
    } catch (error) {
      if (error instanceof DocumentPdfFinalizationError) throw error;
      throw new DocumentPdfFinalizationError("DOCX_VALIDATION_FAILED", "The merged Word document could not be finalized safely.", 422);
    }

    let directory = "";
    try {
      directory = await mkdtemp(join(tmpdir(), `${DOCUMENT_PDF_TEMP_PREFIX}convert-`));
      const profilePath = join(directory, "profile");
      await mkdir(profilePath);
      const inputPath = join(directory, "source.docx");
      const outputPath = join(directory, "source.pdf");
      await writeFile(inputPath, Buffer.from(input.docxBytes), { flag: "wx", mode: 0o600 });
      const result = await runProcess(
        this.executable,
        converterArgs(profilePath, ["--convert-to", "pdf:writer_pdf_Export", "--outdir", directory, inputPath]),
        this.timeoutMs,
        outputPath,
      );
      if (result.timedOut) throw new DocumentPdfFinalizationError("PDF_CONVERSION_TIMEOUT", "The company-template PDF conversion timed out safely.", 504);
      if (result.outputTooLarge) throw new DocumentPdfFinalizationError("PDF_OUTPUT_TOO_LARGE", "The company-template PDF exceeded the safe output limit.");
      if (result.spawnError || result.code !== 0) throw new DocumentPdfFinalizationError("PDF_CONVERSION_FAILED", "The company-template PDF could not be finalized on this deployment.");
      const output = new Uint8Array(await readFile(outputPath));
      if (!isValidPdfBytes(output)) throw new DocumentPdfFinalizationError("PDF_OUTPUT_INVALID", "The company-template PDF converter returned an invalid document.");
      return output;
    } catch (error) {
      if (error instanceof DocumentPdfFinalizationError) throw error;
      throw new DocumentPdfFinalizationError("PDF_CONVERSION_FAILED", "The company-template PDF could not be finalized on this deployment.");
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 2 }).catch(() => {});
    }
  }
}

export async function finalizeMergedDocxToPdf(
  docxBytes: Uint8Array,
  converter: DocumentPdfConverter,
): Promise<Uint8Array> {
  try {
    validateDocxTemplateBytes(docxBytes, "merged.docx", DOCX_MIME_TYPE);
    if (extractDocxMergeTags(docxBytes, "merged.docx").length) {
      throw new DocumentPdfFinalizationError("UNRESOLVED_MERGE_TAGS", "The merged Word document still contains unresolved fields.", 422);
    }
  } catch (error) {
    if (error instanceof DocumentPdfFinalizationError) throw error;
    throw new DocumentPdfFinalizationError("DOCX_VALIDATION_FAILED", "The merged Word document could not be finalized safely.", 422);
  }
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await converter.convert({ docxBytes });
  } catch (error) {
    if (error instanceof DocumentPdfFinalizationError) throw error;
    throw new DocumentPdfFinalizationError("PDF_CONVERSION_FAILED", "The company-template PDF could not be finalized on this deployment.");
  }
  if (!isValidPdfBytes(pdfBytes)) throw new DocumentPdfFinalizationError("PDF_OUTPUT_INVALID", "The company-template PDF converter returned an invalid document.");
  return pdfBytes;
}

export async function createDocumentPdfConverter(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<DocumentPdfConverter> {
  const result = await probeConverterWithCache(env);
  if (result.status !== "AVAILABLE" || !result.executable) {
    throw new DocumentPdfFinalizationError("PDF_CONVERTER_UNAVAILABLE", DOCUMENT_PDF_UNAVAILABLE_MESSAGE);
  }
  return new LibreOfficePdfConverter(result.executable, result.converterVersion || "unknown", timeoutFromEnv(env));
}

export function isValidPdfBytes(bytes: Uint8Array): boolean {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_FINALIZED_PDF_BYTES) return false;
  const prefix = new TextDecoder().decode(bytes.subarray(0, 5));
  if (prefix !== "%PDF-") return false;
  const tail = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.byteLength - 2_048)));
  return /%%EOF\s*$/.test(tail);
}
