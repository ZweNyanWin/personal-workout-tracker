-- Ordinary members own private exercises; only the trusted owner can publish
-- to this instance's shared catalog. Independent coach tenants are not yet supported.
BEGIN;

ALTER TABLE exercises ALTER COLUMN is_public SET DEFAULT false;
DROP POLICY "exercises: authenticated create" ON exercises;
CREATE POLICY "exercises: scoped create" ON exercises FOR INSERT TO authenticated
WITH CHECK (
  is_admin() OR (created_by = auth.uid() AND NOT is_public AND coaching_client_id IS NULL)
);

DROP POLICY "exercises: owner or admin update" ON exercises;
CREATE POLICY "exercises: scoped update" ON exercises FOR UPDATE TO authenticated
USING (
  is_admin() OR (created_by = auth.uid() AND NOT is_public AND coaching_client_id IS NULL)
)
WITH CHECK (
  is_admin() OR (created_by = auth.uid() AND NOT is_public AND coaching_client_id IS NULL)
);

COMMIT;
