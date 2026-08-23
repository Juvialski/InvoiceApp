-- Archive only the historical CloudTech/Apex SAMPLE demo invoices.
-- This is intentionally an UPDATE: original files, source rows, extractions,
-- and review history remain available for audit and recovery.
-- The exact predicates make this migration safe to rerun and do not inspect
-- currency, so real USD uploads and Gmail invoices are never archived by it.

update public.invoices
set archived_at = coalesce(archived_at, now()),
    updated_at = now()
where archived_at is null
  and lower(trim(coalesce(current_data ->> 'sourceType', ''))) = 'sample'
  and (
    lower(trim(coalesce(current_data ->> 'id', ''))) in (
      'sample-1',
      'sample-2',
      'sample-tech-services',
      'sample-hardware-supplies'
    )
    or lower(trim(coalesce(current_data ->> 'invoiceNumber', ''))) in (
      'inv-2026-8894',
      'apx-90241'
    )
    or lower(trim(coalesce(current_data #>> '{vendor,name}', ''))) in (
      'cloudtech solutions inc.',
      'apex wholesale distributors ltd.'
    )
    or lower(trim(coalesce(current_data #>> '{vendor,companyName}', ''))) in (
      'cloudtech solutions inc.',
      'apex wholesale distributors ltd.'
    )
    or lower(trim(coalesce(current_data #>> '{vendor,registeredName}', ''))) in (
      'cloudtech solutions inc.',
      'apex wholesale distributors ltd.'
    )
    or lower(trim(coalesce(current_data #>> '{vendor,tradeName}', ''))) in (
      'cloudtech solutions inc.',
      'apex wholesale distributors ltd.'
    )
    or (
      lower(trim(coalesce(current_data ->> 'modelUsed', ''))) = 'sample-data'
      and (
        lower(trim(coalesce(current_data ->> 'id', ''))) like 'sample-%'
        or lower(trim(coalesce(current_data #>> '{sourceMetadata,attachmentName}', ''))) like '%demo%'
        or lower(trim(coalesce(current_data #>> '{sourceMetadata,attachmentName}', ''))) like '%fictional%'
      )
    )
  );
