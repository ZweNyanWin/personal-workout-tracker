-- Detailed multiweek source documents stay intact in the coach's own draft.
-- Only the bounded text capacity changes; existing RLS, RPC authorization,
-- revision guards, approval and assignment rules remain in force.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.coaching_drafts
  DROP CONSTRAINT coaching_drafts_brief_check;
ALTER TABLE public.coaching_drafts
  ADD CONSTRAINT coaching_drafts_brief_check
  CHECK (length(brief) BETWEEN 1 AND 64000);
COMMIT;
