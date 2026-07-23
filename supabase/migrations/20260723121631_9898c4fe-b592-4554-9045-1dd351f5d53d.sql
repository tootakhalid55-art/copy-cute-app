
CREATE OR REPLACE FUNCTION public.journal_entries_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('posted','reversed') THEN
      RAISE EXCEPTION 'cannot_delete_posted_or_reversed_journal';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- draft -> anything is allowed (draft entries mutable)
    IF OLD.status = 'draft' THEN RETURN NEW; END IF;

    -- posted: allow only status flip to reversed + reversal audit fields
    IF OLD.status = 'posted' THEN
      IF NEW.status NOT IN ('posted','reversed') THEN
        RAISE EXCEPTION 'invalid_journal_status_transition_from_posted';
      END IF;
      IF NEW.entry_number      IS DISTINCT FROM OLD.entry_number
      OR NEW.entry_date        IS DISTINCT FROM OLD.entry_date
      OR NEW.memo              IS DISTINCT FROM OLD.memo
      OR NEW.currency          IS DISTINCT FROM OLD.currency
      OR NEW.exchange_rate     IS DISTINCT FROM OLD.exchange_rate
      OR NEW.total_debit       IS DISTINCT FROM OLD.total_debit
      OR NEW.total_credit      IS DISTINCT FROM OLD.total_credit
      OR NEW.source_module     IS DISTINCT FROM OLD.source_module
      OR NEW.source_document_type IS DISTINCT FROM OLD.source_document_type
      OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id
      OR NEW.event_type        IS DISTINCT FROM OLD.event_type
      OR NEW.event_id          IS DISTINCT FROM OLD.event_id
      OR NEW.branch_id         IS DISTINCT FROM OLD.branch_id
      OR NEW.fiscal_year_id    IS DISTINCT FROM OLD.fiscal_year_id
      OR NEW.period_id         IS DISTINCT FROM OLD.period_id
      OR NEW.created_by        IS DISTINCT FROM OLD.created_by
      OR NEW.posted_by         IS DISTINCT FROM OLD.posted_by
      OR NEW.posted_at         IS DISTINCT FROM OLD.posted_at
      OR NEW.reverses_entry_id IS DISTINCT FROM OLD.reverses_entry_id
      OR NEW.meta              IS DISTINCT FROM OLD.meta THEN
        RAISE EXCEPTION 'cannot_edit_posted_journal';
      END IF;
      RETURN NEW;
    END IF;

    -- reversed: fully frozen
    IF OLD.status = 'reversed' THEN
      RAISE EXCEPTION 'cannot_edit_reversed_journal';
    END IF;
  END IF;

  RETURN NEW;
END; $$;
