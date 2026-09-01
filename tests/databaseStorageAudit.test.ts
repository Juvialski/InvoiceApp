import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const AUDIT_SQL_PATH = path.join(ROOT, "scripts", "database-storage-audit.sql");
const PAYROLL_IMPORT_MIGRATION_PATH = path.join(
  ROOT,
  "supabase",
  "migrations",
  "20260823160000_adaptive_payroll_import_domain.sql",
);

test("database-storage-audit.sql exists and is non-empty", () => {
  assert.ok(existsSync(AUDIT_SQL_PATH), "scripts/database-storage-audit.sql must exist");
  const content = readFileSync(AUDIT_SQL_PATH, "utf8");
  assert.ok(content.length > 500, "Audit script must contain comprehensive SQL queries");
});

test("database-storage-audit.sql strictly obeys read-only safety invariants", () => {
  const content = readFileSync(AUDIT_SQL_PATH, "utf8");

  // Filter out comments to inspect actual SQL keywords
  const uncommentedSql = content
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  // Mutating DDL / DML patterns that MUST NOT appear
  const forbiddenPatterns = [
    /\binsert\s+into\b/i,
    /\bupdate\s+[a-z0-9_.]+\s+set\b/i,
    /\bdelete\s+from\b/i,
    /\bdrop\s+(table|view|schema|database|function|index|trigger)\b/i,
    /\balter\s+(table|view|schema|database|function|index|trigger|role|user)\b/i,
    /\bcreate\s+(table|view|schema|database|function|index|trigger|role|user)\b/i,
    /\btruncate\s+(table)?\b/i,
    /\bvacuum\s+full\b/i,
    /\breindex\s+/i,
    /\bgrant\s+/i,
    /\brevoke\s+/i,
    /\bset\s+role\b/i,
    /\bset\s+session\s+authorization\b/i,
    /\bdisable\s+row\s+level\s+security\b/i,
    /\bsecurity\s+definer\b/i,
    /\bpassword\s*=/i,
    /postgresql:\/\//i
  ];

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(
      uncommentedSql,
      pattern,
      `Forbidden mutating or unsafe SQL pattern found: ${pattern}`
    );
  }

  // Verify all statements begin with SELECT or WITH
  const statements = uncommentedSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  assert.ok(statements.length >= 6, "Expected multiple diagnostic query blocks");

  for (const stmt of statements) {
    const startsWithSelectOrWith = /^(select|with)\b/i.test(stmt);
    assert.ok(
      startsWithSelectOrWith,
      `Diagnostic statement must start with SELECT or WITH, found: ${stmt.slice(0, 40)}...`
    );
  }
});

test("database-storage-audit.sql contains required system catalog and statistics queries", () => {
  const content = readFileSync(AUDIT_SQL_PATH, "utf8");

  // Section 1 & 2: Database and table sizing catalogs
  assert.match(content, /pg_database_size/i, "Must measure total database size");
  assert.match(content, /pg_stat_user_tables/i, "Must query user table statistics");
  assert.match(content, /pg_class/i, "Must query pg_class for relation metadata");
  assert.match(content, /pg_relation_size\(c\.oid\)/i, "Must query table heap size via pg_relation_size");
  assert.match(content, /reltoastrelid/i, "Must query TOAST relation via reltoastrelid");
  assert.match(content, /pg_indexes_size\(c\.oid\)/i, "Must query table index size via pg_indexes_size");
  assert.match(content, /pg_total_relation_size\(c\.oid\)/i, "Must query total relation size via pg_total_relation_size");
  assert.match(content, /pg_size_pretty/i, "Must format sizes with pg_size_pretty");

  // Section 3: Index statistics
  assert.match(content, /pg_stat_user_indexes/i, "Must query user index statistics");
  assert.match(content, /pg_relation_size/i, "Must measure individual index sizes");
  assert.match(content, /idx_scan/i, "Must inspect index scan counts");
  assert.match(content, /pg_get_indexdef/i, "Must retrieve index definitions");

  // Section 4: Data type / Column catalog
  assert.match(content, /information_schema\.columns/i, "Must inspect column data types");
  assert.match(content, /'json'/i, "Must inspect json columns");
  assert.match(content, /'jsonb'/i, "Must inspect jsonb columns");
  assert.match(content, /'bytea'/i, "Must check for in-database binary bytea columns");
});

test("database-storage-audit.sql detects legacy user indexes by indexed columns, not index names", () => {
  const content = readFileSync(AUDIT_SQL_PATH, "utf8");
  const payrollMigration = readFileSync(PAYROLL_IMPORT_MIGRATION_PATH, "utf8");
  const legacyIndexName = "payroll_import_rows_batch_source_idx";

  assert.equal(
    legacyIndexName.includes("user_id"),
    false,
    "Regression fixture must prove the legacy index name itself does not expose user_id",
  );
  assert.match(
    payrollMigration,
    /create index if not exists payroll_import_rows_batch_source_idx\s+on public\.payroll_import_rows\(user_id, batch_id, source_sheet, source_row\)/i,
    "Regression fixture must remain a real user_id-scoped index whose name omits user_id",
  );
  assert.match(content, /unnest\(idx\.indkey\)/i, "Audit must inspect index key columns");
  assert.match(content, /pg_attribute/i, "Audit must resolve indexed column names from pg_attribute");
  assert.match(content, /a\.attname = 'user_id'/i, "Audit must detect user_id from indexed columns");
  assert.match(content, /a\.attname = 'company_id'/i, "Audit must detect company_id from indexed columns");
  assert.doesNotMatch(
    content,
    /indexrelname\s*~\s*'user_id'/i,
    "Audit must not infer user_id membership from the index name",
  );
  assert.doesNotMatch(
    content,
    /indexrelname\s*~\s*'company_id'/i,
    "Audit must not infer company_id membership from the index name",
  );
});

test("database-storage-audit.sql covers high-growth audit and event tables", () => {
  const content = readFileSync(AUDIT_SQL_PATH, "utf8");

  const requiredEventTables = [
    "company_audit_events",
    "project_accounting_events",
    "invoice_review_events",
    "assistant_action_events",
    "assistant_messages",
    "engineering_daily_site_log_events"
  ];

  for (const table of requiredEventTables) {
    assert.match(
      content,
      new RegExp(`public\\.${table}`, "i"),
      `Must inspect high-growth event table: ${table}`
    );
  }

  assert.match(content, /event_type/i, "Must analyze event type distribution");
});

test("database-storage-audit.sql covers staging, temporary, and prunable candidate tables", () => {
  const content = readFileSync(AUDIT_SQL_PATH, "utf8");

  const requiredCandidateTables = [
    "payroll_import_rows",
    "payroll_import_batches",
    "assistant_action_events",
    "invoices",
    "work_entries",
    "expenses",
    "source_documents"
  ];

  for (const table of requiredCandidateTables) {
    assert.match(
      content,
      new RegExp(`public\\.${table}`, "i"),
      `Must inspect prunable/staging candidates on table: ${table}`
    );
  }

  // Specific candidate states
  assert.match(content, /COMMITTED/i, "Must assess committed import rows");
  assert.match(content, /STAGED/i, "Must assess staged import rows");
  assert.match(content, /FAILED/i, "Must assess failed import batches");
  assert.match(content, /VOID/i, "Must assess voided records");
});

test("database-storage-audit.sql verifies off-database binary storage references with exact schema columns", () => {
  const content = readFileSync(AUDIT_SQL_PATH, "utf8");

  // Section 7 must query source_documents, engineering_document_revisions, and payroll_import_batches
  assert.match(content, /public\.source_documents/i, "Must check source document storage pointers");
  assert.match(content, /public\.engineering_document_revisions/i, "Must check engineering revision storage pointers");
  assert.match(content, /public\.payroll_import_batches/i, "Must check payroll import batch storage pointers");

  // Verify exact schema column names:
  // - source_documents uses file_size
  // - engineering_document_revisions uses file_size_bytes (NOT file_size)
  // - payroll_import_batches uses file_size (tracked in DB, not hardcoded 0 or N/A)
  assert.match(
    content,
    /from\s+public\.engineering_document_revisions[\s\S]*?sum\(file_size_bytes\)|sum\(file_size_bytes\)[\s\S]*?from\s+public\.engineering_document_revisions/i,
    "engineering_document_revisions must aggregate file_size_bytes column"
  );
  assert.doesNotMatch(
    content,
    /sum\(file_size\)\s+as\s+total_file_size_bytes\s+from\s+public\.engineering_document_revisions/i,
    "engineering_document_revisions must not reference nonexistent file_size column"
  );
  assert.match(
    content,
    /from\s+public\.source_documents[\s\S]*?sum\(file_size\)|sum\(file_size\)[\s\S]*?from\s+public\.source_documents/i,
    "source_documents must aggregate file_size column"
  );
  assert.match(
    content,
    /from\s+public\.payroll_import_batches[\s\S]*?sum\(file_size\)|sum\(file_size\)[\s\S]*?from\s+public\.payroll_import_batches/i,
    "payroll_import_batches must aggregate actual tracked file_size column"
  );
});
