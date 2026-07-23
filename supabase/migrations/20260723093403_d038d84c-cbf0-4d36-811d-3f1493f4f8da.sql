
CREATE OR REPLACE FUNCTION public.documents_validate_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ok BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- allow any legal starting state; state machine still constrains transitions afterward
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  ok := (OLD.status = 'draft'            AND NEW.status IN ('pending_approval','approved','issued','cancelled'))
     OR (OLD.status = 'pending_approval' AND NEW.status IN ('approved','draft','cancelled'))
     OR (OLD.status = 'approved'         AND NEW.status IN ('posted','issued','cancelled'))
     OR (OLD.status = 'issued'           AND NEW.status IN ('paid','partially_paid','posted','cancelled','archived'))
     OR (OLD.status = 'partially_paid'   AND NEW.status IN ('paid','cancelled','archived'))
     OR (OLD.status = 'paid'             AND NEW.status IN ('archived','cancelled'))
     OR (OLD.status = 'posted'           AND NEW.status IN ('cancelled','archived'));

  IF NOT ok THEN
    RAISE EXCEPTION 'illegal document status transition: % -> %', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'approved' AND NEW.approved_at IS NULL THEN
    NEW.approved_at := now();
    NEW.approved_by := COALESCE(NEW.approved_by, auth.uid());
  END IF;
  IF NEW.status = 'posted' AND NEW.posted_at IS NULL THEN
    NEW.posted_at := now();
  END IF;
  IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
    NEW.cancelled_by := COALESCE(NEW.cancelled_by, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
