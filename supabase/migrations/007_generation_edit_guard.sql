-- A second coach tab must not orphan an active Mac generation by editing its draft.
BEGIN;

CREATE OR REPLACE FUNCTION save_coaching_draft(p_member_id uuid,p_brief text,p_scope jsonb,p_content jsonb DEFAULT NULL,p_draft_id uuid DEFAULT NULL,p_expected_revision integer DEFAULT NULL,p_generation_job_id uuid DEFAULT NULL)
RETURNS coaching_drafts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_draft coaching_drafts;
BEGIN
 IF auth.uid() IS NULL OR NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 PERFORM validate_coaching_scope(p_scope);
 IF p_content IS NOT NULL AND (jsonb_typeof(p_content)<>'object' OR octet_length(p_content::text)>1000000) THEN RAISE EXCEPTION 'Invalid draft content'; END IF;
 IF p_draft_id IS NULL THEN
   INSERT INTO coaching_drafts(member_id,coach_id,brief,scope,content,generation_job_id) VALUES(p_member_id,auth.uid(),btrim(p_brief),p_scope,p_content,NULL) RETURNING * INTO v_draft;
 ELSE
   SELECT * INTO v_draft FROM coaching_drafts WHERE id=p_draft_id AND coach_id=auth.uid() FOR UPDATE;
   IF NOT FOUND OR v_draft.member_id<>p_member_id THEN RAISE EXCEPTION 'Draft not found'; END IF;
   IF v_draft.status<>'draft' THEN RAISE EXCEPTION 'Approved drafts cannot be edited'; END IF;
   IF p_expected_revision IS NULL OR v_draft.revision<>p_expected_revision THEN RAISE EXCEPTION 'Draft changed; reload before saving'; END IF;
   IF v_draft.generation_job_id IS NOT NULL AND v_draft.generation_revision=v_draft.revision
      AND v_draft.updated_at > now()-interval '31 minutes' THEN
     RAISE EXCEPTION 'Tommy is generating this draft. Stop that job before editing in another tab';
   END IF;
   UPDATE coaching_drafts SET brief=btrim(p_brief),scope=p_scope,content=p_content,generation_job_id=NULL,generation_revision=NULL,revision=revision+1,updated_at=now() WHERE id=p_draft_id RETURNING * INTO v_draft;
 END IF;
 RETURN v_draft;
END;
$$;

COMMIT;
