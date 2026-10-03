-- Canonical public home movements provide usable choices when a coach's saved
-- gym library is incompatible with the client's available equipment. These are
-- exercise identities, not workout prescriptions or evidence of client ability.
-- Preserve every existing coach/client exercise and avoid duplicate defaults.
BEGIN;

INSERT INTO public.exercises
  (name, description, muscle_groups, movement_type, equipment, is_compound,
   primary_lift, created_by, is_public, coaching_client_id, organization_id)
SELECT source.name, source.description, source.muscle_groups, source.movement_type,
  source.equipment, source.is_compound, NULL, NULL, true, NULL, NULL
FROM (VALUES
  ('Push-ups', 'Bodyweight floor push-ups; select an appropriate regression with the coach.', ARRAY['chest','triceps','front_delt'], 'push', 'bodyweight', true),
  ('Parallette Push-up', 'Push-ups using stable parallettes; this is not a dip progression.', ARRAY['chest','triceps','front_delt'], 'push', 'bodyweight', true),
  ('Dumbbell Goblet Squat', 'Goblet squat holding the available dumbbell.', ARRAY['quads','glutes'], 'squat', 'dumbbell', true),
  ('Dumbbell Overhead Press', 'Dumbbell overhead press using the available load.', ARRAY['front_delt','triceps'], 'push', 'dumbbell', true),
  ('Resistance Band Row', 'Row with a resistance band and a secure suitable setup.', ARRAY['lats','rhomboids','biceps'], 'pull', 'bands', true),
  ('Bodyweight Squat', 'Unloaded squat with a controlled range appropriate to the client.', ARRAY['quads','glutes'], 'squat', 'bodyweight', true),
  ('Reverse Lunge', 'Bodyweight reverse lunge; support or load only when specified.', ARRAY['quads','glutes'], 'squat', 'bodyweight', true),
  ('Dumbbell Farmer''s Carry', 'Carry the available dumbbells; duration is not an isometric hold.', ARRAY['forearms','traps','core'], 'carry', 'dumbbell', true),
  ('Plank', 'Bodyweight plank; terminate before position loss.', ARRAY['core'], 'accessory', 'bodyweight', false),
  ('Band-Assisted Push-up', 'Assisted push-up with a suitable secure band setup; not added resistance.', ARRAY['chest','triceps','front_delt'], 'push', 'bands', true)
) AS source(name, description, muscle_groups, movement_type, equipment, is_compound)
WHERE NOT EXISTS (
  SELECT 1 FROM public.exercises existing
  WHERE lower(existing.name) = lower(source.name)
    AND existing.created_by IS NULL AND existing.coaching_client_id IS NULL
    AND existing.organization_id IS NULL AND existing.is_public
);

COMMIT;
