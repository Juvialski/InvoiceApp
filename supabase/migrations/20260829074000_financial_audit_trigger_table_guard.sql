-- Correct the shared financial audit trigger so table-specific NEW fields are
-- only referenced after the trigger table has been identified.
--
-- The original cash foundation used a single audit trigger function for
-- financial_transactions and financial_transaction_matches. PostgreSQL can
-- attempt to resolve NEW.source while the function is executing for a match
-- row, where that field does not exist. Keep the existing audit semantics but
-- branch on TG_TABLE_NAME before touching table-specific record fields.

create or replace function private.audit_financial_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text;
  v_target_id uuid;
  v_metadata jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'financial_accounts' then
    v_event := case
      when tg_op = 'INSERT' then 'CASH_ACCOUNT_CREATED'
      when new.active = false and old.active is distinct from false then 'CASH_ACCOUNT_DEACTIVATED'
      else 'CASH_ACCOUNT_UPDATED'
    end;
    v_target_id := new.id;
    v_metadata := jsonb_build_object(
      'display_name', new.display_name,
      'account_type', new.account_type,
      'currency', new.currency,
      'masked_identifier', new.masked_identifier
    );

  elsif tg_table_name = 'financial_balance_snapshots' then
    v_event := 'CASH_BALANCE_SNAPSHOT_RECORDED';
    v_target_id := new.id;
    v_metadata := jsonb_build_object(
      'account_id', new.account_id,
      'source', new.source,
      'captured_at', new.captured_at
    );

  elsif tg_table_name = 'financial_import_batches' then
    v_event := case
      when new.status = 'FAILED' then 'CASH_STATEMENT_REJECTED'
      else 'CASH_STATEMENT_IMPORTED'
    end;
    v_target_id := new.id;
    v_metadata := jsonb_build_object(
      'account_id', new.account_id,
      'file_name', new.file_name,
      'row_count', new.row_count,
      'imported_count', new.imported_count,
      'duplicate_count', new.duplicate_count,
      'rejected_count', new.rejected_count
    );

  elsif tg_table_name = 'financial_transactions' then
    if new.source <> 'MANUAL' then
      return new;
    end if;
    v_event := case
      when tg_op = 'INSERT' then 'CASH_TRANSACTION_CREATED'
      else 'CASH_TRANSACTION_UPDATED'
    end;
    v_target_id := new.id;
    v_metadata := jsonb_build_object(
      'account_id', new.account_id,
      'transaction_date', new.transaction_date,
      'direction', new.direction,
      'amount', new.amount,
      'source', new.source
    );

  elsif tg_table_name = 'financial_transaction_matches' then
    if tg_op = 'UPDATE'
       and old.status = 'CONFIRMED'
       and new.status = 'REJECTED' then
      v_event := 'CASH_RECONCILIATION_REMOVED';
    elsif new.status = 'CONFIRMED' then
      v_event := case
        when new.target_type = 'TRANSFER' then 'CASH_TRANSFER_MATCHED'
        else 'CASH_RECONCILIATION_CONFIRMED'
      end;
    else
      return new;
    end if;

    v_target_id := new.transaction_id;
    v_metadata := jsonb_build_object(
      'match_id', new.id,
      'target_type', new.target_type,
      'target_id', new.target_id,
      'matched_amount', new.matched_amount
    );

  else
    return new;
  end if;

  perform private.write_company_audit(
    new.company_id,
    v_event,
    'financial',
    v_target_id,
    v_metadata
  );
  return new;
end;
$$;
