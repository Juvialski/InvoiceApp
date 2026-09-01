#!/usr/bin/env node
/**
 * Database Growth & Retention Pruning CLI.
 * Safely evaluates or executes conservative retention policies for transient/prunable database rows.
 *
 * Usage:
 *   npx.cmd tsx scripts/db-retention-prune.ts [options]
 *
 * Options:
 *   --company-id <uuid>   Deployment company UUID (or from COMPANY_ID env)
 *   --dry-run             Dry-run mode (default, prints candidates without pruning)
 *   --execute             Execute actual deletion and record audit log
 *   --limit <number>      Maximum candidates to evaluate (default: 50, max: 100)
 *   --json                Output results strictly as formatted JSON
 *   -h, --help            Show this help guide
 */

import "dotenv/config";
import {
  RetentionService,
  UUID_PATTERN,
  DEFAULT_PRUNE_LIMIT,
  MAX_PRUNE_LIMIT,
  MIN_PRUNE_LIMIT,
} from "../src/server/database/retentionService.ts";

interface ParsedCliArgs {
  companyId?: string;
  dryRun: boolean;
  limit: number;
  json: boolean;
  help: boolean;
}

function parseCliArgs(argv: string[]): ParsedCliArgs {
  const args = argv.slice(2);
  let companyId =
    process.env.COMPANY_ID ||
    process.env.ENGORYX_COMPANY_ID ||
    process.env.VITE_COMPANY_ID ||
    undefined;
  let dryRun = true;
  let limit = DEFAULT_PRUNE_LIMIT;
  let json = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--execute") {
      dryRun = false;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--company-id") {
      const next = args[++i];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --company-id option.");
      }
      companyId = next.trim();
    } else if (arg.startsWith("--company-id=")) {
      companyId = arg.split("=")[1].trim();
    } else if (arg === "--limit") {
      const next = args[++i];
      if (!next || isNaN(Number(next))) {
        throw new Error("Invalid or missing numeric value for --limit option.");
      }
      limit = Math.max(MIN_PRUNE_LIMIT, Math.min(Number(next), MAX_PRUNE_LIMIT));
    } else if (arg.startsWith("--limit=")) {
      const val = Number(arg.split("=")[1]);
      if (isNaN(val)) {
        throw new Error("Invalid numeric value for --limit option.");
      }
      limit = Math.max(MIN_PRUNE_LIMIT, Math.min(val, MAX_PRUNE_LIMIT));
    } else {
      throw new Error(`Unknown CLI argument: "${arg}"`);
    }
  }

  return { companyId, dryRun, limit, json, help };
}

function printUsage(): void {
  console.log(`
Engoryx Database Growth & Retention Pruning CLI
==============================================

Evaluates or executes conservative retention pruning against transient, unreferenced database records.

Invariants:
- Scoped strictly to the target company_id.
- Dry-run mode by default (dryRun: true).
- Protects all records linked to invoices, expenses, payroll runs, work entries, or audit history.

Usage:
  npx.cmd tsx scripts/db-retention-prune.ts [options]

Options:
  --company-id <uuid>   Deployment company UUID (or set COMPANY_ID in env)
  --dry-run             Evaluate eligible records without deleting (default)
  --execute             Perform deletion of eligible transient records
  --limit <number>      Maximum candidate records to evaluate (default: 50, max: 100)
  --json                Output strictly structured JSON summary
  -h, --help            Display this usage guide
`);
}

async function main(): Promise<void> {
  let parsed: ParsedCliArgs;
  try {
    parsed = parseCliArgs(process.argv);
  } catch (err: any) {
    console.error(`CLI argument error: ${err.message}`);
    process.exit(1);
  }

  if (parsed.help) {
    printUsage();
    process.exit(0);
  }

  if (!parsed.companyId || !UUID_PATTERN.test(parsed.companyId)) {
    console.error(
      `Error: Valid company ID is required. Pass --company-id <uuid> or set COMPANY_ID environment variable. (Received: "${parsed.companyId || ""}")`,
    );
    process.exit(1);
  }

  const service = new RetentionService();

  if (!parsed.json) {
    console.log("============================================================");
    console.log(" Engoryx Conservative Database Retention Pruning");
    console.log("============================================================");
    console.log(`Company ID : ${parsed.companyId}`);
    console.log(`Mode       : ${parsed.dryRun ? "DRY-RUN (Safe evaluation only)" : "EXECUTE (Permanent deletion)"}`);
    console.log(`Limit      : ${parsed.limit}`);
    console.log("------------------------------------------------------------");
  }

  try {
    const result = await service.pruneRetention({
      companyId: parsed.companyId,
      dryRun: parsed.dryRun,
      limit: parsed.limit,
    });

    if (parsed.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("\n[Summary]");
      console.log(`Total Candidates Found : ${result.candidatesCount}`);
      console.log(`Total Records Pruned   : ${result.prunedCount}`);
      console.log("\n[Category Breakdown]");
      console.log(`- Assistant Actions    : ${result.categories.assistantActions.candidatesCount} candidate(s), ${result.categories.assistantActions.prunedCount} pruned`);
      console.log(`- Payroll Batches      : ${result.categories.payrollBatches.candidatesCount} candidate(s), ${result.categories.payrollBatches.prunedCount} pruned`);
      console.log(`- Source Documents     : ${result.categories.sourceDocuments.candidatesCount} candidate(s), ${result.categories.sourceDocuments.prunedCount} pruned`);

      if (result.errors.length > 0) {
        console.warn("\n[Warnings / Non-fatal Errors]");
        for (const error of result.errors) {
          console.warn(`! ${error}`);
        }
      }

      if (parsed.dryRun) {
        console.log("\n✓ Dry-run completed successfully. No rows were deleted.");
      } else {
        console.log(`\n✓ Retention pruning executed successfully. ${result.prunedCount} record(s) removed.`);
        if (result.executionProof?.auditEventLogged) {
          console.log("✓ Audit event recorded in company_audit_events.");
        }
      }
    }

    if (result.errors.length > 0 && result.prunedCount === 0 && result.candidatesCount === 0) {
      process.exit(1);
    }
  } catch (err: any) {
    if (parsed.json) {
      console.error(JSON.stringify({ error: err.message || String(err), code: err.code || "FATAL_ERROR" }));
    } else {
      console.error(`\n✖ Fatal retention pruning error: ${err.message || String(err)}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled top-level error:", err);
  process.exit(1);
});
