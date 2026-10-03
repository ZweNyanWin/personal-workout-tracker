-- Evaluate source-root visibility from the row under review. The previous
-- STABLE helpers re-read the same table using the statement's earlier snapshot,
-- so an authenticated INSERT ... RETURNING could not see its newly inserted row.
-- Keep those helpers for callers looking up an existing ID and leave every
-- write policy, tenant identity trigger and restrictive access policy intact.
BEGIN;

ALTER POLICY "exercises: scoped read" ON exercises USING (
 auth.uid() IS NOT NULL AND (
  (coaching_client_id IS NULL AND (
   (created_by IS NULL AND is_public AND organization_id IS NULL)
   OR created_by=auth.uid()
   OR (is_public AND organization_id=current_coach_organization())
  ))
  OR (coaching_client_id IS NOT NULL AND (
   coaching_client_id=auth.uid() OR can_coach_member(coaching_client_id)
  ))
 )
);

ALTER POLICY "programs: scoped read" ON programs USING (
 auth.uid() IS NOT NULL AND (
  (client_id IS NULL AND created_by IS NULL AND organization_id IS NULL)
  OR (is_admin() AND organization_id=current_coach_organization()
   AND (client_id IS NULL OR can_coach_member(client_id)))
  OR client_id=auth.uid()
  OR EXISTS(SELECT 1 FROM user_program_assignments a
   WHERE a.program_id=programs.id AND a.user_id=auth.uid())
 )
);

COMMIT;
