#!/usr/bin/env node
/**
 * Database Growth & Retention Candidate Discovery CLI.
 *
 * Wave S4 intentionally remains non-destructive. It identifies bounded, company-scoped
 * retention candidates but does not delete them until S5 defines and reviews explicit
 * retention/lifecycle policy for each domain and associated object-storage cleanup.
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
  let limit = DEFAULT_PRUNE_LIMIT;
  let json = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--dry-run") {
      // Retained as a compatibility no-op because S4 is always dry-run.
    } else if (arg === "--execute") {
      throw new Error(
        "Destructive retention execution is intentionally disabled in Wave S4. Use dry-run candidate discovery; reviewed deletion policy and object cleanup move to S5.",
      );
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

  return { companyId, limit, json, help };
}

function printUsage(): void {
  console.log(`
Engoryx Database Retention Candidate Discovery
==============================================

Wave S4 provides bounded, company-scoped retention analysis only. It does not delete records.
Physical/object cleanup and reviewed retention execution are intentionally deferred to S5.

Usage:
  npx.cmd tsx scripts/db-retention-prune.ts [options]

Options:
  --company-id <uuid>   Deployment company UUID (or set COMPANY_ID in env)
  --dry-run             Compatibility flag; S4 is always dry-run
  --limit <number>      Maximum candidate records to evaluate (default: 50, max: 100)
  --json                Output structured JSON summary
  -h, --help            Display this usage guide

The legacy --execute flag is rejected intentionally.
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
    console.log(" Engoryx Database Retention Candidate Discovery");
    console.log("============================================================");
    console.log(`Company ID : ${parsed.companyId}`);
    console.log("Mode       : DRY-RUN ONLY (no database rows are deleted in S4)");
    console.log(`Limit      : ${parsed.limit}`);
    console.log("------------------------------------------------------------");
  }

  try {
    const result = await service.pruneRetention({
      companyId: parsed.companyId,
      dryRun: true,
      limit: parsed.limit,
    });

    if (parsed.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("\n[Summary]");
      console.log(`Total Candidates Found : ${result.candidatesCount}`);
      console.log("Total Records Pruned   : 0 (S4 execution disabled)");
      console.log("\n[Category Breakdown]");
      console.log(`- Assistant Actions    : ${result.categories.assistantActions.candidatesCount} candidate(s)`);
      console.log(`- Payroll Batches      : ${result.categories.payrollBatches.candidatesCount} candidate(s)`);
      console.log(`- Source Documents     : ${result.categories.sourceDocuments.candidatesCount} candidate(s)`);

      if (result.errors.length > 0) {
        console.warn("\n[Warnings / Non-fatal Errors]");
        for (const error of result.errors) {
          console.warn(`! ${error}`);
        }
      }

      console.log("\nDry-run completed. No rows were deleted. Review candidates before S5 retention policy is implemented.");
    }

    if (result.errors.length > 0 && result.candidatesCount === 0) {
      process.exit(1);
    }
  } catch (err: any) {
    if (parsed.json) {
      console.error(JSON.stringify({ error: err.message || String(err), code: err.code || "FATAL_ERROR" }));
    } else {
      console.error(`\nFatal retention discovery error: ${err.message || String(err)}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled top-level error:", err);
  process.exit(1);
});
