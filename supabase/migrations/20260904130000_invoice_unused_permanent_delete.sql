-- Engoryx forward correction: allow DELETE_UNUSED for extracted invoices that
-- have never entered protected financial or operational use.
--
-- Extraction line items, immutable extraction snapshots, initial non-final
-- review events, and source-document/source-email links are invoice-owned
-- intake provenance. They are not proof that the invoice became financial
-- history. Protected downstream relationships remain authoritative blockers.

-- The foundation trigger intentionally rejects client deletes from the
-- append-only extraction/review tables. An invoice DELETE_UNUSED RPC may still
-- cascade those disposable children, but only after the guarded RPC has
-- locked and rechecked the invoice. The transaction-local marker is never set
-- by the client-facing preview path and direct authenticated DELETE privileges
-- remain revoked.
create or replace function public.prevent_invoice_record_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and pg_catalog.current_setting('app.invoice_unused_delete_authorized', true) = 'on' then
    return old;
  end if;
  raise exception 'Immutable invoice extraction snapshots and review history cannot be changed';
end;
$$;

revoke execute on function public.prevent_invoice_record_mutation() from public, anon, authenticated;

create index if not exists source_documents_company_object_idx
  on public.source_documents(company_id, storage_provider, storage_bucket, storage_path);

create index if not exists company_audit_events_company_target_idx
  on public.company_audit_events(company_id, target_type, target_id, event_type);

-- Replace the existing private preflight in place through a forward migration.
-- `dependencies` retains the complete diagnostic inventory for callers, while
-- `blockingDependencies` and `disposableDependencies` make the safety
-- decision explicit and testable.
create or replace function private.invoice_correction_preflight(
  p_invoice_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_line_items bigint := 0;
  v_extractions bigint := 0;
  v_review_events bigint := 0;
  v_disposable_review_events bigint := 0;
  v_protected_review_events bigint := 0;
  v_project_allocations bigint := 0;
  v_settlement_matches bigint := 0;
  v_confirmed_settlements bigint := 0;
  v_project_accounting_events bigint := 0;
  v_purchase_order_matches bigint := 0;
  v_source_document bigint := 0;
  v_source_email bigint := 0;
  v_source_document_invoice_refs bigint := 0;
  v_source_document_expense_refs bigint := 0;
  v_source_document_import_refs bigint := 0;
  v_source_document_shared_object_refs bigint := 0;
  v_source_document_backup_refs bigint := 0;
  v_source_document_migration_refs bigint := 0;
  v_source_document_shared_refs bigint := 0;
  v_duplicate_references bigint := 0;
  v_company_audit_events bigint := 0;
  v_disposable_company_audit_events bigint := 0;
  v_protected_company_audit_events bigint := 0;
  v_verified_history bigint := 0;
  v_payment_evidence bigint := 0;
  v_total bigint := 0;
  v_protected_total bigint := 0;
  v_disposable_total bigint := 0;
  v_amount_paid numeric := 0;
  v_payment_status text;
  v_embedded_payment_status text;
  v_can_delete boolean;
  v_can_void boolean;
  v_can_archive boolean;
  v_can_restore boolean;
  v_recommended_action text;
  v_blocked_reason text;
  v_source_document_provider text;
  v_source_document_bucket text;
  v_source_document_path text;
  v_storage_cleanup jsonb;
begin
  select i.*
    into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
    and i.company_id = p_company_id;

  if not found then
    raise exception 'Invoice does not exist in the deployment company'
      using errcode = '42501';
  end if;

  -- These children are disposable invoice-owned intake/provenance records.
  -- They remain visible in the diagnostic inventory, but do not by themselves
  -- make DELETE_UNUSED unavailable.
  select count(*) into v_line_items
  from public.invoice_line_items l
  where l.company_id = p_company_id and l.invoice_id = p_invoice_id;

  select count(*) into v_extractions
  from public.invoice_extractions e
  where e.company_id = p_company_id and e.invoice_id = p_invoice_id;

  select
    count(*),
    count(*) filter (where upper(coalesce(e.event_type, '')) in ('AI_EXTRACTION_CREATED', 'AI_REEXTRACTION_CREATED', 'HUMAN_EDIT')),
    count(*) filter (where upper(coalesce(e.event_type, '')) not in ('AI_EXTRACTION_CREATED', 'AI_REEXTRACTION_CREATED', 'HUMAN_EDIT', 'VERIFIED'))
  into v_review_events, v_disposable_review_events, v_protected_review_events
  from public.invoice_review_events e
  where e.company_id = p_company_id and e.invoice_id = p_invoice_id;

  -- These relationships represent project cost, cash evidence, or an
  -- auditable project accounting history and always block hard deletion.
  select count(*) into v_project_allocations
  from public.invoice_project_allocations a
  where a.company_id = p_company_id and a.invoice_id = p_invoice_id;

  select count(*), count(*) filter (where m.status = 'CONFIRMED')
    into v_settlement_matches, v_confirmed_settlements
  from public.financial_transaction_matches m
  where m.company_id = p_company_id
    and m.target_type = 'INVOICE'
    and m.target_id = p_invoice_id;

  select count(*) into v_project_accounting_events
  from public.project_accounting_events e
  where e.company_id = p_company_id
    and upper(e.entity_type) = 'INVOICE'
    and e.entity_id = p_invoice_id;

  -- P2A-3 deliberately uses ON DELETE RESTRICT. Count every row, including
  -- UNMATCHED rows, because the PO domain preserves that operational history.
  select count(*) into v_purchase_order_matches
  from public.purchase_order_invoice_matches m
  where m.company_id = p_company_id
    and m.invoice_id = p_invoice_id;

  -- Source links are provenance. The invoice delete will SET NULL on these
  -- relationships; it never deletes an email, source-document row, or object.
  v_source_document := case when v_invoice.source_document_id is null then 0 else 1 end;
  v_source_email := case when v_invoice.source_email_id is null then 0 else 1 end;

  if v_invoice.source_document_id is not null then
    select d.storage_provider, d.storage_bucket, d.storage_path
      into v_source_document_provider, v_source_document_bucket, v_source_document_path
    from public.source_documents d
    where d.id = v_invoice.source_document_id
      and d.company_id = p_company_id;

    select count(*) into v_source_document_invoice_refs
    from public.invoices i
    where i.company_id = p_company_id
      and i.source_document_id = v_invoice.source_document_id
      and i.id <> p_invoice_id;

    select count(*) into v_source_document_expense_refs
    from public.expenses e
    where e.company_id = p_company_id
      and e.receipt_source_document_id = v_invoice.source_document_id;

    select count(*) into v_source_document_import_refs
    from public.financial_import_batches b
    where b.company_id = p_company_id
      and b.source_document_id = v_invoice.source_document_id;

    -- A provider-neutral object may be shared by more than one metadata row.
    -- Never treat a source path as exclusively owned without checking it.
    select count(*) into v_source_document_shared_object_refs
    from public.source_documents d
    where d.company_id = p_company_id
      and d.id <> v_invoice.source_document_id
      and d.storage_provider is not distinct from v_source_document_provider
      and d.storage_bucket is not distinct from v_source_document_bucket
      and d.storage_path is not distinct from v_source_document_path;

    -- Backup and migration manifests use provider-neutral text document IDs.
    -- They are retained bookkeeping and deliberately do not authorize physical
    -- object deletion from this financial correction transaction.
    select count(*) into v_source_document_backup_refs
    from public.document_backup_replicas b
    where b.company_id = p_company_id
      and b.document_id in (v_invoice.source_document_id::text, p_invoice_id::text);

    select count(*) into v_source_document_migration_refs
    from public.document_migration_records m
    where m.company_id = p_company_id
      and m.document_id in (v_invoice.source_document_id::text, p_invoice_id::text);
  end if;

  v_source_document_shared_refs := v_source_document_invoice_refs
    + v_source_document_expense_refs
    + v_source_document_import_refs
    + v_source_document_shared_object_refs;

  -- Duplicate links are cross-record operational references. ON DELETE SET
  -- NULL must not silently erase either side of a duplicate relationship.
  select count(*) + case when v_invoice.duplicate_of_id is null then 0 else 1 end
    into v_duplicate_references
  from public.invoices i
  where i.company_id = p_company_id
    and i.duplicate_of_id = p_invoice_id;

  -- Creation/extraction provenance audit names are disposable. Unknown or
  -- lifecycle/financial audit names remain protected by default so a later
  -- domain cannot accidentally weaken this preflight by adding an event.
  select
    count(*),
    count(*) filter (where upper(coalesce(e.event_type, '')) in ('INVOICE_CREATED', 'INVOICE_IMPORTED', 'INVOICE_EXTRACTION_CREATED', 'INVOICE_EXTRACTED', 'INVOICE_SOURCE_ATTACHED')),
    count(*) filter (where upper(coalesce(e.event_type, '')) not in ('INVOICE_CREATED', 'INVOICE_IMPORTED', 'INVOICE_EXTRACTION_CREATED', 'INVOICE_EXTRACTED', 'INVOICE_SOURCE_ATTACHED'))
  into v_company_audit_events, v_disposable_company_audit_events, v_protected_company_audit_events
  from public.company_audit_events e
  where e.company_id = p_company_id
    and e.target_id = p_invoice_id
    and lower(e.target_type) in ('invoice', 'invoices');

  v_payment_status := upper(coalesce(nullif(btrim(v_invoice.payment_status), ''), 'UNPAID'));
  v_embedded_payment_status := upper(coalesce(nullif(btrim(v_invoice.current_data ->> 'status'), ''), ''));
  if coalesce(v_invoice.current_data ->> 'amountPaid', '') ~ '^[-+]?[0-9]+([.][0-9]+)?$' then
    v_amount_paid := greatest(0, (v_invoice.current_data ->> 'amountPaid')::numeric);
  end if;

  -- Protect both the authoritative payment column and any legacy/current-data
  -- payment evidence so a stale client shape cannot reopen a paid invoice.
  v_payment_evidence := case
    when v_payment_status in ('PAID', 'PARTIALLY_PAID')
      or v_embedded_payment_status in ('PAID', 'PARTIALLY_PAID')
      or v_amount_paid > 0 then 1
    else 0
  end;

  -- VERIFIED state, verified_at, embedded finalized state, or a retained
  -- VERIFIED event is sufficient proof of finalized invoice history.
  v_verified_history := case
    when upper(coalesce(v_invoice.review_status, '')) = 'VERIFIED'
      or v_invoice.verified_at is not null
      or upper(coalesce(v_invoice.current_data ->> 'reviewStatus', '')) = 'VERIFIED'
      or v_invoice.current_data ->> 'verifiedAt' is not null
      or exists (
        select 1
        from public.invoice_review_events e
        where e.company_id = p_company_id
          and e.invoice_id = p_invoice_id
          and upper(coalesce(e.event_type, '')) = 'VERIFIED'
      ) then 1
    else 0
  end;

  v_protected_total := v_project_allocations
    + v_settlement_matches
    + v_project_accounting_events
    + v_purchase_order_matches
    + v_duplicate_references
    + v_protected_review_events
    + v_protected_company_audit_events
    + v_verified_history
    + v_payment_evidence;

  v_disposable_total := v_line_items
    + v_extractions
    + v_disposable_review_events
    + v_source_document
    + v_source_email
    + v_disposable_company_audit_events;

  -- Keep the legacy aggregate as a complete diagnostic inventory. The new
  -- protected/disposable aggregates are the eligibility contract.
  v_total := v_line_items
    + v_extractions
    + v_review_events
    + v_project_allocations
    + v_settlement_matches
    + v_project_accounting_events
    + v_purchase_order_matches
    + v_source_document
    + v_source_email
    + v_duplicate_references
    + v_company_audit_events
    + v_payment_evidence
    + v_verified_history;

  v_can_delete := v_invoice.lifecycle_status = 'ACTIVE'
    and v_invoice.archived_at is null
    and v_protected_total = 0;
  v_can_void := v_invoice.lifecycle_status = 'ACTIVE' and v_confirmed_settlements = 0;
  v_can_archive := v_invoice.archived_at is null;
  v_can_restore := v_invoice.archived_at is not null;

  v_recommended_action := case
    when v_can_delete then 'DELETE_UNUSED'
    when v_invoice.lifecycle_status = 'VOID' and v_can_restore then 'RESTORE'
    when v_invoice.lifecycle_status = 'VOID' then 'NONE'
    when v_can_void and v_protected_total > 0 then 'VOID'
    when v_can_archive then 'ARCHIVE'
    when v_can_restore then 'RESTORE'
    else 'NONE'
  end;

  v_blocked_reason := case
    when v_confirmed_settlements > 0 then format(
      'Cannot permanently delete — this invoice has %s confirmed payment/settlement record%s. Correct the settlement evidence through the Wave 2B3 cash correction workflow first.',
      v_confirmed_settlements,
      case when v_confirmed_settlements = 1 then '' else 's' end
    )
    when v_purchase_order_matches > 0 then format(
      'Cannot permanently delete — this invoice has %s Purchase Order match record%s. Unmatch it through the procurement workflow while preserving the match history.',
      v_purchase_order_matches,
      case when v_purchase_order_matches = 1 then '' else 's' end
    )
    when v_project_allocations > 0 then format(
      'Cannot permanently delete — this invoice has %s project cost allocation record%s. Preserve the allocation and use VOID or another authoritative correction.',
      v_project_allocations,
      case when v_project_allocations = 1 then '' else 's' end
    )
    when v_project_accounting_events > 0 then format(
      'Cannot permanently delete — this invoice has %s project accounting event%s.',
      v_project_accounting_events,
      case when v_project_accounting_events = 1 then '' else 's' end
    )
    when v_settlement_matches > 0 then 'Cannot permanently delete — payment or settlement history exists for this invoice. Preserve the cash evidence and use the authoritative correction workflow.'
    when v_payment_evidence > 0 then 'Cannot permanently delete — this invoice contains paid or partially-paid evidence. Preserve its financial history and use VOID or archive.'
    when v_verified_history > 0 then 'Cannot permanently delete — this invoice is verified or has finalized verification history. Void it with a reason, or archive it for visibility organization.'
    when v_duplicate_references > 0 then 'Cannot permanently delete — a duplicate/reference relationship points to this invoice. Resolve it through the invoice workflow while preserving the relationship history.'
    when v_protected_review_events > 0 or v_protected_company_audit_events > 0 then 'Cannot permanently delete — protected invoice lifecycle or audit history exists. Use VOID or archive to preserve the record.'
    when v_invoice.lifecycle_status = 'VOID' then 'This invoice is already void. Its original values and history remain preserved.'
    when v_invoice.archived_at is not null then 'This invoice is archived. Restore visibility to return it to the active invoice directory.'
    else null
  end;

  v_storage_cleanup := jsonb_build_object(
    'sourceDocumentId', v_invoice.source_document_id,
    'invoiceRelationship', case when v_invoice.source_document_id is null then 'NONE' else 'SET_NULL_ON_INVOICE_DELETE' end,
    'relationship', case
      when v_invoice.source_document_id is null then 'NONE'
      when v_source_document_shared_refs > 0 then 'RETAINED_SHARED_OR_REFERENCED'
      when v_source_document_backup_refs > 0 or v_source_document_migration_refs > 0 then 'RETAINED_BACKUP_OR_MIGRATION_BOOKKEEPING'
      else 'RETAINED_FOR_CONSERVATIVE_RETENTION_CLEANUP'
    end,
    'physicalObjectDeleted', false,
    'note', 'The guarded invoice correction does not delete provider objects. The invoice relationship is cleared by the existing foreign-key action; source-document metadata and physical storage remain available to the conservative storage-retention lifecycle.'
  );

  return jsonb_build_object(
    'entityType', 'INVOICE',
    'entityId', p_invoice_id,
    'status', v_payment_status,
    'paymentStatus', v_payment_status,
    'reviewStatus', v_invoice.review_status,
    'lifecycleStatus', v_invoice.lifecycle_status,
    'archivedAt', v_invoice.archived_at,
    'voidedAt', v_invoice.voided_at,
    'canDelete', v_can_delete,
    'canVoid', v_can_void,
    'canArchive', v_can_archive,
    'canRestore', v_can_restore,
    'recommendedAction', v_recommended_action,
    'blockedReason', v_blocked_reason,
    'totalDependencyCount', v_total,
    'protectedDependencyCount', v_protected_total,
    'disposableDependencyCount', v_disposable_total,
    'confirmedSettlementCount', v_confirmed_settlements,
    'dependencies', jsonb_build_object(
      'lineItems', v_line_items,
      'extractions', v_extractions,
      'reviewEvents', v_review_events,
      'projectAllocations', v_project_allocations,
      'settlementMatches', v_settlement_matches,
      'confirmedSettlementMatches', v_confirmed_settlements,
      'projectAccountingEvents', v_project_accounting_events,
      'purchaseOrderMatches', v_purchase_order_matches,
      'sourceDocument', v_source_document,
      'sourceEmail', v_source_email,
      'sourceDocumentSharedReferences', v_source_document_shared_refs,
      'sourceDocumentBackupReferences', v_source_document_backup_refs,
      'sourceDocumentMigrationReferences', v_source_document_migration_refs,
      'duplicateReferences', v_duplicate_references,
      'companyAuditEvents', v_company_audit_events,
      'paymentEvidence', v_payment_evidence,
      'verifiedHistory', v_verified_history
    ),
    'blockingDependencies', jsonb_build_object(
      'projectAllocations', v_project_allocations,
      'settlementMatches', v_settlement_matches,
      'confirmedSettlementMatches', v_confirmed_settlements,
      'projectAccountingEvents', v_project_accounting_events,
      'purchaseOrderMatches', v_purchase_order_matches,
      'duplicateReferences', v_duplicate_references,
      'protectedReviewEvents', v_protected_review_events,
      'protectedCompanyAuditEvents', v_protected_company_audit_events,
      'paymentEvidence', v_payment_evidence,
      'verifiedHistory', v_verified_history
    ),
    'disposableDependencies', jsonb_build_object(
      'lineItems', v_line_items,
      'extractions', v_extractions,
      'reviewEvents', v_disposable_review_events,
      'sourceDocument', v_source_document,
      'sourceEmail', v_source_email,
      'disposableCompanyAuditEvents', v_disposable_company_audit_events
    ),
    'storageCleanup', v_storage_cleanup
  );
end;
$$;

-- Keep the public API, authorization boundary, target lock, and all existing
-- VOID/ARCHIVE/RESTORE semantics. Only the DELETE_UNUSED child cascade gets
-- the transaction-local append-only trigger marker.
create or replace function public.apply_invoice_correction(
  p_invoice_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_id uuid := (select private.deployment_company_id());
  v_invoice public.invoices;
  v_preflight jsonb;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_before jsonb;
begin
  perform private.require_financial_correction_permission(v_company_id, 'invoices.manage', 'invoice');

  if v_action not in ('DELETE_UNUSED', 'VOID', 'ARCHIVE', 'RESTORE') then
    raise exception 'Invoice correction action is invalid'
      using errcode = '22023';
  end if;

  select i.*
    into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
    and i.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Invoice does not exist in the deployment company'
      using errcode = '42501';
  end if;

  -- The invoice row is locked before the protected/deletable dependency scan.
  -- Child foreign-key inserts and guarded polymorphic relationship writes must
  -- wait for this lock, so this preflight is authoritative for the mutation.
  v_preflight := private.invoice_correction_preflight(p_invoice_id, v_company_id);
  v_before := to_jsonb(v_invoice);

  if v_action = 'DELETE_UNUSED' then
    if coalesce((v_preflight ->> 'canDelete')::boolean, false) is not true then
      raise exception '%', coalesce(v_preflight ->> 'blockedReason', 'This invoice has protected financial or operational history and cannot be permanently deleted.')
        using errcode = '42501';
    end if;

    perform private.write_company_audit(
      v_company_id,
      'INVOICE_DELETED_UNUSED',
      'invoice',
      p_invoice_id,
      jsonb_build_object(
        'action', v_action,
        'reason', coalesce(v_reason, 'Confirmed unused invoice deletion'),
        'preflight', v_preflight,
        'recordBeforeDelete', v_before,
        'originalValues', v_invoice.current_data
      )
    );

    -- Permit only the invoice-owned extraction/review cascades for the rest of
    -- this transaction. The marker is reset before returning and rolls back on
    -- any failure together with the audit row and parent delete.
    perform pg_catalog.set_config('app.invoice_unused_delete_authorized', 'on', true);
    delete from public.invoices
    where id = p_invoice_id and company_id = v_company_id;
    perform pg_catalog.set_config('app.invoice_unused_delete_authorized', 'off', true);

    return jsonb_build_object(
      'entityType', 'INVOICE',
      'entityId', p_invoice_id,
      'action', v_action,
      'deleted', true,
      'changed', true,
      'preflight', v_preflight
    );
  end if;

  if v_action = 'VOID' then
    if v_invoice.lifecycle_status = 'VOID' then
      return jsonb_build_object(
        'entityType', 'INVOICE',
        'entityId', p_invoice_id,
        'action', v_action,
        'deleted', false,
        'changed', false,
        'preflight', v_preflight,
        'record', to_jsonb(v_invoice)
      );
    end if;
    if coalesce((v_preflight ->> 'confirmedSettlementCount')::bigint, 0) > 0 then
      raise exception '%', v_preflight ->> 'blockedReason'
        using errcode = '42501';
    end if;
    if v_invoice.review_status = 'VERIFIED' then
      perform private.require_financial_correction_permission(v_company_id, 'invoices.verify', 'verified invoice');
    end if;
    if v_reason is null then
      raise exception 'A reason is required to void an invoice'
        using errcode = '22023';
    end if;

    update public.invoices
    set lifecycle_status = 'VOID',
        voided_at = now(),
        voided_by_user_id = v_actor,
        void_reason = v_reason,
        updated_at = now()
    where id = p_invoice_id and company_id = v_company_id
    returning * into v_invoice;

    insert into public.invoice_review_events(
      user_id, company_id, invoice_id, event_type, previous_value, new_value
    ) values (
      v_actor, v_company_id, p_invoice_id, 'INVOICE_VOIDED',
      v_before,
      jsonb_build_object('lifecycleStatus', 'VOID', 'reason', v_reason, 'voidedAt', v_invoice.voided_at, 'voidedByUserId', v_actor)
    );
    perform private.write_company_audit(
      v_company_id,
      'INVOICE_VOIDED',
      'invoice',
      p_invoice_id,
      jsonb_build_object(
        'action', v_action,
        'reason', v_reason,
        'voidedAt', v_invoice.voided_at,
        'voidedByUserId', v_actor,
        'preflight', v_preflight,
        'recordBeforeVoid', v_before,
        'originalValues', (v_before -> 'current_data')
      )
    );
  elsif v_action = 'ARCHIVE' then
    if v_invoice.archived_at is not null then
      return jsonb_build_object(
        'entityType', 'INVOICE',
        'entityId', p_invoice_id,
        'action', v_action,
        'deleted', false,
        'changed', false,
        'preflight', v_preflight,
        'record', to_jsonb(v_invoice)
      );
    end if;
    if v_reason is null then
      raise exception 'A reason is required to archive an invoice'
        using errcode = '22023';
    end if;
    update public.invoices
    set archived_at = now(), updated_at = now()
    where id = p_invoice_id and company_id = v_company_id
    returning * into v_invoice;
    insert into public.invoice_review_events(
      user_id, company_id, invoice_id, event_type, previous_value, new_value
    ) values (
      v_actor, v_company_id, p_invoice_id, 'INVOICE_ARCHIVED',
      v_before,
      jsonb_build_object('archivedAt', v_invoice.archived_at, 'reason', v_reason)
    );
    perform private.write_company_audit(v_company_id, 'INVOICE_ARCHIVED', 'invoice', p_invoice_id,
      jsonb_build_object('action', v_action, 'reason', v_reason, 'preflight', v_preflight, 'recordBeforeArchive', v_before));
  else
    if v_invoice.archived_at is null then
      return jsonb_build_object(
        'entityType', 'INVOICE',
        'entityId', p_invoice_id,
        'action', v_action,
        'deleted', false,
        'changed', false,
        'preflight', v_preflight,
        'record', to_jsonb(v_invoice)
      );
    end if;
    if v_reason is null then
      raise exception 'A reason is required to restore an invoice to the visible directory'
        using errcode = '22023';
    end if;
    update public.invoices
    set archived_at = null, updated_at = now()
    where id = p_invoice_id and company_id = v_company_id
    returning * into v_invoice;
    insert into public.invoice_review_events(
      user_id, company_id, invoice_id, event_type, previous_value, new_value
    ) values (
      v_actor, v_company_id, p_invoice_id, 'INVOICE_RESTORED',
      v_before,
      jsonb_build_object('archivedAt', null, 'reason', v_reason)
    );
    perform private.write_company_audit(v_company_id, 'INVOICE_RESTORED', 'invoice', p_invoice_id,
      jsonb_build_object('action', v_action, 'reason', v_reason, 'preflight', v_preflight, 'recordBeforeRestore', v_before));
  end if;

  return jsonb_build_object(
    'entityType', 'INVOICE',
    'entityId', p_invoice_id,
    'action', v_action,
    'deleted', false,
    'changed', true,
    'preflight', v_preflight,
    'record', to_jsonb(v_invoice)
  );
end;
$$;

revoke all on function public.preview_invoice_correction(uuid) from public, anon;
revoke all on function public.apply_invoice_correction(uuid, text, text) from public, anon;
grant execute on function public.preview_invoice_correction(uuid) to authenticated;
grant execute on function public.apply_invoice_correction(uuid, text, text) to authenticated;
