/**
 * Conservative Database Retention & Pruning Service.
 * Implements safe, auditable, company-isolated pruning of transient/prunable database rows.
 *
 * Core Invariants:
 * 1. Dry-run mode by default (dryRun: true).
 * 2. Scoped strictly to the active company_id.
 * 3. Explicit eligible states only:
 *    - Expired AI action events (assistant_action_events with status in ('EXPIRED', 'CANCELLED') or status = 'PREPARED' and expires_at < now() - 30 days).
 *    - Failed or voided payroll import batches (payroll_import_batches with status in ('FAILED', 'VOIDED') and created_at < now() - 30 days), provided no committed payroll_runs reference the batch.
 *    - Unlinked temporary source documents (source_documents with source_type = 'TEMP' or created_at < now() - 14 days, and not referenced by invoices, expenses, or financial_import_batches).
 * 4. Never delete records referenced by live/auditable business data.
 * 5. Bounded batch size (default 50, maximum 100, minimum 1).
 * 6. Full execution proof and optional audit logging in company_audit_events.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorageServerServiceRoleClient } from "../storage/storageCompensation.ts";

export const DEFAULT_PRUNE_LIMIT = 50;
export const MAX_PRUNE_LIMIT = 100;
export const MIN_PRUNE_LIMIT = 1;

export const ASSISTANT_ACTIONS_RETENTION_DAYS = 30;
export const PAYROLL_BATCHES_RETENTION_DAYS = 30;
export const SOURCE_DOCUMENTS_RETENTION_DAYS = 14;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RetentionPrunableCategory = "assistantActions" | "payrollBatches" | "sourceDocuments";

export interface CategoryPruningResult {
  candidatesCount: number;
  prunedCount: number;
  candidateIds: string[];
}

export interface RetentionPruningSummary {
  companyId: string;
  dryRun: boolean;
  candidatesCount: number;
  prunedCount: number;
  categories: {
    assistantActions: CategoryPruningResult;
    payrollBatches: CategoryPruningResult;
    sourceDocuments: CategoryPruningResult;
  };
  candidateIds: string[];
  errors: string[];
  executionProof?: {
    executedAt: string;
    actorUserId?: string | null;
    prunedTotal: number;
    auditEventLogged: boolean;
    details: Record<string, any>;
  };
}

export interface RetentionPruningOptions {
  companyId: string;
  dryRun?: boolean;
  limit?: number;
  categories?: RetentionPrunableCategory[];
  now?: Date;
  actorUserId?: string | null;
}

export interface RetentionServiceOptions {
  supabaseClientSupplier?: () => SupabaseClient;
  privilegedClientSupplier?: () => SupabaseClient;
}

export class RetentionServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = "RETENTION_SERVICE_ERROR", status = 400) {
    super(message);
    this.name = "RetentionServiceError";
    this.code = code;
    this.status = status;
  }
}

export class RetentionService {
  private readonly getSupabase: () => SupabaseClient;
  private readonly getPrivilegedSupabase: () => SupabaseClient;

  constructor(options?: RetentionServiceOptions | SupabaseClient) {
    if (options && typeof options === "object" && "from" in options) {
      const client = options as SupabaseClient;
      this.getSupabase = () => client;
      this.getPrivilegedSupabase = () => client;
    } else if (options && typeof options === "object") {
      const opts = options as RetentionServiceOptions;
      this.getSupabase = opts.supabaseClientSupplier || (() => getStorageServerServiceRoleClient());
      this.getPrivilegedSupabase =
        opts.privilegedClientSupplier || opts.supabaseClientSupplier || (() => getStorageServerServiceRoleClient());
    } else {
      this.getSupabase = () => getStorageServerServiceRoleClient();
      this.getPrivilegedSupabase = () => getStorageServerServiceRoleClient();
    }
  }

  /**
   * Validate company ID format according to single deployment boundary invariants.
   */
  private validateCompanyId(companyId: string): void {
    if (!companyId || typeof companyId !== "string" || !UUID_PATTERN.test(companyId.trim())) {
      throw new RetentionServiceError(
        `Invalid company context for retention pruning: "${companyId}". Expected valid UUID.`,
        "INVALID_COMPANY_ID",
        400,
      );
    }
  }

  /**
   * Normalize and clamp batch limit.
   */
  private clampLimit(limit?: number): number {
    if (typeof limit !== "number" || isNaN(limit)) {
      return DEFAULT_PRUNE_LIMIT;
    }
    return Math.max(MIN_PRUNE_LIMIT, Math.min(Math.floor(limit), MAX_PRUNE_LIMIT));
  }

  /**
   * Discover candidate assistant action events eligible for pruning.
   * Eligible states:
   * 1. status in ('EXPIRED', 'CANCELLED')
   * 2. status = 'PREPARED' and expires_at < now - 30 days
   */
  async discoverCandidateAssistantActions(
    companyId: string,
    limit: number,
    now: Date = new Date(),
  ): Promise<string[]> {
    this.validateCompanyId(companyId);
    const client = this.getSupabase();
    const clampedLimit = this.clampLimit(limit);
    const cutoffDate = new Date(now.getTime() - ASSISTANT_ACTIONS_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    // Query assistant_action_events with candidate statuses
    const { data: rows, error } = await client
      .from("assistant_action_events")
      .select("id, company_id, status, expires_at, created_at")
      .eq("company_id", companyId)
      .in("status", ["EXPIRED", "CANCELLED", "PREPARED"])
      .limit(clampedLimit * 2);

    if (error) {
      throw new RetentionServiceError(
        `Failed to discover candidate assistant actions: ${error.message}`,
        "DISCOVERY_FAILED",
        500,
      );
    }

    const candidateIds: string[] = [];

    for (const row of rows || []) {
      if (candidateIds.length >= clampedLimit) break;
      if (row.company_id !== companyId) continue;

      if (row.status === "EXPIRED" || row.status === "CANCELLED") {
        candidateIds.push(row.id);
      } else if (row.status === "PREPARED") {
        const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
        if (expiresAt && expiresAt.getTime() < cutoffDate.getTime()) {
          candidateIds.push(row.id);
        }
      }
    }

    return candidateIds;
  }

  /**
   * Verify whether a specific payroll import batch is safe to prune.
   * Returns true only if no active/committed payroll runs, committed import rows,
   * or duplicate batch pointers reference it.
   */
  async verifyPayrollBatchEligible(companyId: string, batchId: string): Promise<boolean> {
    this.validateCompanyId(companyId);
    const client = this.getSupabase();

    // 1. Check if batch itself is in FAILED or VOIDED state
    const { data: batch, error: batchErr } = await client
      .from("payroll_import_batches")
      .select("id, company_id, status, committed_payroll_run_id, committed_payroll_period_id")
      .eq("company_id", companyId)
      .eq("id", batchId)
      .maybeSingle();

    if (batchErr || !batch) return false;
    if (batch.status !== "FAILED" && batch.status !== "VOIDED") return false;
    if (batch.committed_payroll_run_id || batch.committed_payroll_period_id) return false;

    // 2. Check if any payroll_runs reference this batch
    const { data: runs, error: runsErr } = await client
      .from("payroll_runs")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("import_batch_id", batchId)
      .limit(1);

    if (runsErr || (runs && runs.length > 0)) return false;

    // 3. Check if any payroll_import_rows have committed work or payroll entries
    const { data: committedRows, error: rowsErr } = await client
      .from("payroll_import_rows")
      .select("id")
      .eq("company_id", companyId)
      .eq("batch_id", batchId)
      .or("committed_work_entry_id.not.is.null,committed_payroll_entry_id.not.is.null")
      .limit(1);

    if (rowsErr || (committedRows && committedRows.length > 0)) return false;

    // 4. Check if any other import batches point to this batch as duplicate_of_batch_id
    const { data: dupes, error: dupesErr } = await client
      .from("payroll_import_batches")
      .select("id")
      .eq("company_id", companyId)
      .eq("duplicate_of_batch_id", batchId)
      .limit(1);

    if (dupesErr || (dupes && dupes.length > 0)) return false;

    return true;
  }

  /**
   * Discover candidate payroll import batches eligible for pruning.
   * Eligible states:
   * 1. status in ('FAILED', 'VOIDED')
   * 2. created_at < now - 30 days
   * 3. No committed payroll runs or live references.
   */
  async discoverCandidatePayrollBatches(
    companyId: string,
    limit: number,
    now: Date = new Date(),
  ): Promise<string[]> {
    this.validateCompanyId(companyId);
    const client = this.getSupabase();
    const clampedLimit = this.clampLimit(limit);
    const cutoffDate = new Date(now.getTime() - PAYROLL_BATCHES_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const { data: rows, error } = await client
      .from("payroll_import_batches")
      .select("id, company_id, status, created_at, committed_payroll_run_id, committed_payroll_period_id")
      .eq("company_id", companyId)
      .in("status", ["FAILED", "VOIDED"])
      .lt("created_at", cutoffDate.toISOString())
      .limit(clampedLimit * 2);

    if (error) {
      throw new RetentionServiceError(
        `Failed to discover candidate payroll batches: ${error.message}`,
        "DISCOVERY_FAILED",
        500,
      );
    }

    const candidateIds: string[] = [];

    for (const row of rows || []) {
      if (candidateIds.length >= clampedLimit) break;
      if (row.company_id !== companyId) continue;
      if (row.committed_payroll_run_id || row.committed_payroll_period_id) continue;

      const isEligible = await this.verifyPayrollBatchEligible(companyId, row.id);
      if (isEligible) {
        candidateIds.push(row.id);
      }
    }

    return candidateIds;
  }

  /**
   * Verify whether a specific source document is safe to prune.
   * Returns true only if no invoices, expenses, or financial import batches reference it.
   */
  async verifySourceDocumentEligible(companyId: string, documentId: string): Promise<boolean> {
    this.validateCompanyId(companyId);
    const client = this.getSupabase();

    // 1. Check if referenced by invoices
    const { data: invoices, error: invErr } = await client
      .from("invoices")
      .select("id")
      .eq("company_id", companyId)
      .eq("source_document_id", documentId)
      .limit(1);

    if (invErr || (invoices && invoices.length > 0)) return false;

    // 2. Check if referenced by expenses
    const { data: expenses, error: expErr } = await client
      .from("expenses")
      .select("id")
      .eq("company_id", companyId)
      .eq("receipt_source_document_id", documentId)
      .limit(1);

    if (expErr || (expenses && expenses.length > 0)) return false;

    // 3. Check if referenced by financial_import_batches
    const { data: finBatches, error: finErr } = await client
      .from("financial_import_batches")
      .select("id")
      .eq("company_id", companyId)
      .eq("source_document_id", documentId)
      .limit(1);

    if (finErr || (finBatches && finBatches.length > 0)) return false;

    return true;
  }

  /**
   * Discover candidate source documents eligible for pruning.
   * Eligible states:
   * 1. source_type = 'TEMP' OR created_at < now - 14 days
   * 2. Not referenced by invoices, expenses, or financial import batches.
   */
  async discoverCandidateSourceDocuments(
    companyId: string,
    limit: number,
    now: Date = new Date(),
  ): Promise<string[]> {
    this.validateCompanyId(companyId);
    const client = this.getSupabase();
    const clampedLimit = this.clampLimit(limit);
    const cutoffDate = new Date(now.getTime() - SOURCE_DOCUMENTS_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const { data: rows, error } = await client
      .from("source_documents")
      .select("id, company_id, source_type, created_at")
      .eq("company_id", companyId)
      .limit(clampedLimit * 3);

    if (error) {
      throw new RetentionServiceError(
        `Failed to discover candidate source documents: ${error.message}`,
        "DISCOVERY_FAILED",
        500,
      );
    }

    const candidateIds: string[] = [];

    for (const row of rows || []) {
      if (candidateIds.length >= clampedLimit) break;
      if (row.company_id !== companyId) continue;

      const isTemp = row.source_type === "TEMP";
      const isOlderThanRetention = row.created_at
        ? new Date(row.created_at).getTime() < cutoffDate.getTime()
        : false;

      if (!isTemp && !isOlderThanRetention) continue;

      const isEligible = await this.verifySourceDocumentEligible(companyId, row.id);
      if (isEligible) {
        candidateIds.push(row.id);
      }
    }

    return candidateIds;
  }

  /**
   * Main entrypoint for retention pruning execution.
   * Invariants:
   * - Default dryRun: true.
   * - Scoped strictly to the provided companyId.
   * - Safe reference checks before any destructive deletion.
   * - Bounded limits across candidate categories.
   * - Records audit log in company_audit_events or provides execution proof when executed.
   */
  async pruneRetention(options: RetentionPruningOptions): Promise<RetentionPruningSummary> {
    const { companyId, dryRun = true, now = new Date(), actorUserId = null } = options;
    this.validateCompanyId(companyId);

    const totalLimit = this.clampLimit(options.limit);
    const requestedCategories = options.categories || ["assistantActions", "payrollBatches", "sourceDocuments"];

    const summary: RetentionPruningSummary = {
      companyId,
      dryRun,
      candidatesCount: 0,
      prunedCount: 0,
      categories: {
        assistantActions: { candidatesCount: 0, prunedCount: 0, candidateIds: [] },
        payrollBatches: { candidatesCount: 0, prunedCount: 0, candidateIds: [] },
        sourceDocuments: { candidatesCount: 0, prunedCount: 0, candidateIds: [] },
      },
      candidateIds: [],
      errors: [],
    };

    let remainingLimit = totalLimit;

    // 1. Assistant actions candidate discovery
    if (requestedCategories.includes("assistantActions") && remainingLimit > 0) {
      try {
        const actionIds = await this.discoverCandidateAssistantActions(companyId, remainingLimit, now);
        summary.categories.assistantActions.candidatesCount = actionIds.length;
        summary.categories.assistantActions.candidateIds = actionIds;
        summary.candidateIds.push(...actionIds);
        summary.candidatesCount += actionIds.length;
        remainingLimit -= actionIds.length;
      } catch (err: any) {
        summary.errors.push(`Assistant actions discovery error: ${err.message || String(err)}`);
      }
    }

    // 2. Payroll batches candidate discovery
    if (requestedCategories.includes("payrollBatches") && remainingLimit > 0) {
      try {
        const batchIds = await this.discoverCandidatePayrollBatches(companyId, remainingLimit, now);
        summary.categories.payrollBatches.candidatesCount = batchIds.length;
        summary.categories.payrollBatches.candidateIds = batchIds;
        summary.candidateIds.push(...batchIds);
        summary.candidatesCount += batchIds.length;
        remainingLimit -= batchIds.length;
      } catch (err: any) {
        summary.errors.push(`Payroll batches discovery error: ${err.message || String(err)}`);
      }
    }

    // 3. Source documents candidate discovery
    if (requestedCategories.includes("sourceDocuments") && remainingLimit > 0) {
      try {
        const docIds = await this.discoverCandidateSourceDocuments(companyId, remainingLimit, now);
        summary.categories.sourceDocuments.candidatesCount = docIds.length;
        summary.categories.sourceDocuments.candidateIds = docIds;
        summary.candidateIds.push(...docIds);
        summary.candidatesCount += docIds.length;
        remainingLimit -= docIds.length;
      } catch (err: any) {
        summary.errors.push(`Source documents discovery error: ${err.message || String(err)}`);
      }
    }

    // If dry-run mode, return summary without executing deletions
    if (dryRun) {
      return summary;
    }

    // Execute safe deletions
    const client = this.getSupabase();

    // 1. Prune Assistant Actions
    const actionCandidateIds = summary.categories.assistantActions.candidateIds;
    if (actionCandidateIds.length > 0) {
      try {
        const { error } = await client
          .from("assistant_action_events")
          .delete()
          .eq("company_id", companyId)
          .in("id", actionCandidateIds);

        if (error) {
          summary.errors.push(`Failed to delete assistant actions: ${error.message}`);
        } else {
          summary.categories.assistantActions.prunedCount = actionCandidateIds.length;
          summary.prunedCount += actionCandidateIds.length;
        }
      } catch (err: any) {
        summary.errors.push(`Assistant actions deletion error: ${err.message || String(err)}`);
      }
    }

    // 2. Prune Payroll Batches
    const batchCandidateIds = summary.categories.payrollBatches.candidateIds;
    if (batchCandidateIds.length > 0) {
      try {
        // Cascade delete dependent import rows within the company boundary first
        await client
          .from("payroll_import_rows")
          .delete()
          .eq("company_id", companyId)
          .in("batch_id", batchCandidateIds);

        const { error } = await client
          .from("payroll_import_batches")
          .delete()
          .eq("company_id", companyId)
          .in("id", batchCandidateIds);

        if (error) {
          summary.errors.push(`Failed to delete payroll import batches: ${error.message}`);
        } else {
          summary.categories.payrollBatches.prunedCount = batchCandidateIds.length;
          summary.prunedCount += batchCandidateIds.length;
        }
      } catch (err: any) {
        summary.errors.push(`Payroll batches deletion error: ${err.message || String(err)}`);
      }
    }

    // 3. Prune Source Documents
    const docCandidateIds = summary.categories.sourceDocuments.candidateIds;
    if (docCandidateIds.length > 0) {
      try {
        const { error } = await client
          .from("source_documents")
          .delete()
          .eq("company_id", companyId)
          .in("id", docCandidateIds);

        if (error) {
          summary.errors.push(`Failed to delete source documents: ${error.message}`);
        } else {
          summary.categories.sourceDocuments.prunedCount = docCandidateIds.length;
          summary.prunedCount += docCandidateIds.length;
        }
      } catch (err: any) {
        summary.errors.push(`Source documents deletion error: ${err.message || String(err)}`);
      }
    }

    // Record audit event and execution proof
    if (summary.prunedCount > 0) {
      let auditLogged = false;
      try {
        const auditClient = this.getPrivilegedSupabase();
        const { error: auditError } = await auditClient.from("company_audit_events").insert({
          company_id: companyId,
          actor_user_id: actorUserId || null,
          event_type: "COMPANY_UPDATED",
          target_type: "DATABASE_RETENTION",
          target_id: null,
          metadata: {
            operation: "RETENTION_PRUNE",
            prunedCount: summary.prunedCount,
            categories: {
              assistantActions: summary.categories.assistantActions.prunedCount,
              payrollBatches: summary.categories.payrollBatches.prunedCount,
              sourceDocuments: summary.categories.sourceDocuments.prunedCount,
            },
            candidateIds: summary.candidateIds,
            executedAt: new Date().toISOString(),
          },
        });
        if (!auditError) {
          auditLogged = true;
        }
      } catch {
        auditLogged = false;
      }

      summary.executionProof = {
        executedAt: new Date().toISOString(),
        actorUserId: actorUserId || null,
        prunedTotal: summary.prunedCount,
        auditEventLogged: auditLogged,
        details: {
          assistantActions: summary.categories.assistantActions.prunedCount,
          payrollBatches: summary.categories.payrollBatches.prunedCount,
          sourceDocuments: summary.categories.sourceDocuments.prunedCount,
        },
      };
    }

    return summary;
  }
}
