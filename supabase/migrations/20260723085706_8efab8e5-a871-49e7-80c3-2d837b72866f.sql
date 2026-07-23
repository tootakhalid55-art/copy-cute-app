
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS parties_org_type_idx ON public.parties(org_id, type);
CREATE INDEX IF NOT EXISTS items_org_idx ON public.items(org_id);
