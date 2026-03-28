-- ============================================================
-- PowerBuild Tracker — Seed Data
-- Run AFTER 001_schema.sql and 002_rls.sql
-- NOTE: Replace placeholder UUIDs with real auth.users UUIDs
--       after creating accounts in Supabase Auth.
-- ============================================================

-- ─── Placeholder UUIDs — replace with real auth user IDs ────
-- Admin:   00000000-0000-0000-0000-000000000001
-- Member1: 00000000-0000-0000-0000-000000000002
-- Member2: 00000000-0000-0000-0000-000000000003

-- ─── Profiles ────────────────────────────────────────────────
INSERT INTO profiles (id, email, full_name, username, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@powerbuild.app',   'Zwe Nyan Win', 'zwe',     'admin'),
  ('00000000-0000-0000-0000-000000000002', 'alex@powerbuild.app',    'Alex M',       'alex_m',  'member'),
  ('00000000-0000-0000-0000-000000000003', 'jordan@powerbuild.app',  'Jordan K',     'jordan_k','member')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username  = EXCLUDED.username,
  role      = EXCLUDED.role;

-- ─── Exercises ───────────────────────────────────────────────
INSERT INTO exercises (id, name, description, muscle_groups, movement_type, equipment, is_compound, primary_lift, is_public) VALUES
  ('e0000001-0000-0000-0000-000000000001', 'Competition Bench Press',    'Flat barbell bench — competition style, pause optional', ARRAY['chest','triceps','front_delt'], 'push',      'barbell',   TRUE,  'bench',    TRUE),
  ('e0000001-0000-0000-0000-000000000002', 'Paused Bench Press',         '2-second pause at chest', ARRAY['chest','triceps','front_delt'],                                'push',      'barbell',   TRUE,  'bench',    TRUE),
  ('e0000001-0000-0000-0000-000000000003', 'Close-Grip Bench Press',     'Narrow grip for tricep emphasis', ARRAY['triceps','chest','front_delt'],                        'push',      'barbell',   TRUE,  'bench',    TRUE),
  ('e0000001-0000-0000-0000-000000000004', 'DB Incline Press',           'Dumbbell incline 30–45°', ARRAY['chest','front_delt','triceps'],                                'push',      'dumbbell',  TRUE,  NULL,       TRUE),
  ('e0000001-0000-0000-0000-000000000005', 'High-Bar Squat',             'Olympic-style high-bar back squat', ARRAY['quads','glutes','hamstrings'],                      'squat',     'barbell',   TRUE,  'squat',    TRUE),
  ('e0000001-0000-0000-0000-000000000006', 'Low-Bar Squat',              'Powerlifting-style low-bar squat', ARRAY['quads','glutes','hamstrings','lower_back'],           'squat',     'barbell',   TRUE,  'squat',    TRUE),
  ('e0000001-0000-0000-0000-000000000007', 'Tempo Squat',                '3-0-1 tempo for positional work', ARRAY['quads','glutes','hamstrings'],                         'squat',     'barbell',   TRUE,  'squat',    TRUE),
  ('e0000001-0000-0000-0000-000000000008', 'Conventional Deadlift',      'Standard conventional pull', ARRAY['hamstrings','glutes','lower_back','traps'],                 'hinge',     'barbell',   TRUE,  'deadlift', TRUE),
  ('e0000001-0000-0000-0000-000000000009', 'Romanian Deadlift',          'RDL for hamstring hypertrophy', ARRAY['hamstrings','glutes','lower_back'],                      'hinge',     'barbell',   TRUE,  'deadlift', TRUE),
  ('e0000001-0000-0000-0000-000000000010', 'Deficit Deadlift',           '1-2" deficit for off-the-floor strength', ARRAY['hamstrings','glutes','lower_back'],            'hinge',     'barbell',   TRUE,  'deadlift', TRUE),
  ('e0000001-0000-0000-0000-000000000011', 'Weighted Pull-Up',           'Pull-ups with added weight', ARRAY['lats','biceps','rear_delt'],                                'pull',      'bodyweight',TRUE,  NULL,       TRUE),
  ('e0000001-0000-0000-0000-000000000012', 'Barbell Row',                'Bent-over barbell row, pronated', ARRAY['lats','rhomboids','biceps','rear_delt'],               'pull',      'barbell',   TRUE,  NULL,       TRUE),
  ('e0000001-0000-0000-0000-000000000013', 'Cable Row',                  'Seated cable row, neutral grip', ARRAY['lats','rhomboids','biceps'],                            'pull',      'cable',     TRUE,  NULL,       TRUE),
  ('e0000001-0000-0000-0000-000000000014', 'Overhead Press',             'Strict barbell press', ARRAY['front_delt','triceps','upper_chest'],                             'push',      'barbell',   TRUE,  NULL,       TRUE),
  ('e0000001-0000-0000-0000-000000000015', 'Leg Press',                  '45° leg press machine', ARRAY['quads','glutes'],                                                'squat',     'machine',   FALSE, NULL,       TRUE),
  ('e0000001-0000-0000-0000-000000000016', 'Leg Curl',                   'Lying or seated hamstring curl', ARRAY['hamstrings'],                                           'hinge',     'machine',   FALSE, NULL,       TRUE),
  ('e0000001-0000-0000-0000-000000000017', 'Tricep Pushdown',            'Cable pushdown, rope or bar', ARRAY['triceps'],                                                 'accessory', 'cable',     FALSE, NULL,       TRUE),
  ('e0000001-0000-0000-0000-000000000018', 'DB Lateral Raise',           'Lateral delts isolation', ARRAY['side_delt'],                                                   'accessory', 'dumbbell',  FALSE, NULL,       TRUE),
  ('e0000001-0000-0000-0000-000000000019', 'Face Pull',                  'Cable face pull for rear delt and external rotation', ARRAY['rear_delt','rotator_cuff'],        'accessory', 'cable',     FALSE, NULL,       TRUE),
  ('e0000001-0000-0000-0000-000000000020', 'DB Curl',                    'Dumbbell bicep curl', ARRAY['biceps'],                                                          'accessory', 'dumbbell',  FALSE, NULL,       TRUE),
  ('e0000001-0000-0000-0000-000000000021', 'Ab Wheel',                   'Ab wheel rollout', ARRAY['core','abs'],                                                         'accessory', 'other',     FALSE, NULL,       TRUE),
  ('e0000001-0000-0000-0000-000000000022', 'Cable Crunch',               'Kneeling cable crunch', ARRAY['abs','core'],                                                    'accessory', 'cable',     FALSE, NULL,       TRUE)
ON CONFLICT (id) DO NOTHING;

-- ─── Program ─────────────────────────────────────────────────
INSERT INTO programs (id, title, description, created_by, is_template) VALUES
  ('p0000001-0000-0000-0000-000000000001',
   'Upper/Lower Powerbuilding',
   'Classic 4-session Upper A / Lower A / Upper B / Lower B cycle. Combines strength work on the big 3 with hypertrophy accessories.',
   '00000000-0000-0000-0000-000000000001',
   TRUE)
ON CONFLICT (id) DO NOTHING;

-- ─── Blocks ──────────────────────────────────────────────────
INSERT INTO program_blocks (id, program_id, title, description, order_index, duration_weeks) VALUES
  ('b0000001-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000001', 'Accumulation',   'Volume base — higher reps, moderate intensity',     0, 4),
  ('b0000001-0000-0000-0000-000000000002', 'p0000001-0000-0000-0000-000000000001', 'Strength Base',  'Transition to heavier loading',                     1, 4),
  ('b0000001-0000-0000-0000-000000000003', 'p0000001-0000-0000-0000-000000000001', 'Intensification','Heavy triples and doubles, peak strength',           2, 3),
  ('b0000001-0000-0000-0000-000000000004', 'p0000001-0000-0000-0000-000000000001', 'Taper',          'Reduce volume, maintain intensity, sharpen for test',3, 1)
ON CONFLICT (id) DO NOTHING;

-- ─── Sessions (Accumulation block as example) ────────────────
INSERT INTO program_sessions (id, block_id, program_id, title, session_order, notes) VALUES
  ('s0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000001', 'Upper A', 0, 'Push focus — bench + OHP + rows + accessories'),
  ('s0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000001', 'Lower A', 1, 'Squat focus — high bar + RDL + leg accessories'),
  ('s0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000001', 'Upper B', 2, 'Pull focus — weighted pull-ups + paused bench + row'),
  ('s0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000001', 'Lower B', 3, 'Deadlift focus — conventional DL + tempo squat + accessories')
ON CONFLICT (id) DO NOTHING;

-- ─── Session Exercises ───────────────────────────────────────
-- Upper A
INSERT INTO session_exercises (session_id, exercise_id, order_index, target_sets, target_reps, target_rpe, rest_seconds, notes, is_warmup) VALUES
  ('s0000001-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000001', 0, 4, '6-8',  7.5, 180, 'Comp bench — build to top set, 3 back-off sets',    FALSE),
  ('s0000001-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000014', 1, 3, '8-10', 7.0, 120, 'Strict press — moderate weight',                    FALSE),
  ('s0000001-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000012', 2, 3, '8-10', 7.0, 120, 'Barbell row, pull to belt',                         FALSE),
  ('s0000001-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000004', 3, 3, '10-12',6.5, 90,  'DB incline — chest pump',                           FALSE),
  ('s0000001-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000017', 4, 3, '12-15',NULL, 60, 'Pushdown — superset with curl if energy allows',    FALSE),
  ('s0000001-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000019', 5, 3, '15-20',NULL, 60, 'Face pull — shoulder health',                       FALSE);

-- Lower A
INSERT INTO session_exercises (session_id, exercise_id, order_index, target_sets, target_reps, target_rpe, rest_seconds, notes, is_warmup) VALUES
  ('s0000001-0000-0000-0000-000000000002', 'e0000001-0000-0000-0000-000000000005', 0, 4, '6-8',  7.5, 180, 'High-bar squat — build up, 3 back-off sets',        FALSE),
  ('s0000001-0000-0000-0000-000000000002', 'e0000001-0000-0000-0000-000000000009', 1, 3, '8-10', 7.0, 120, 'RDL — feel the stretch, no rounding',               FALSE),
  ('s0000001-0000-0000-0000-000000000002', 'e0000001-0000-0000-0000-000000000015', 2, 3, '10-12',6.5, 90,  'Leg press — full ROM',                              FALSE),
  ('s0000001-0000-0000-0000-000000000002', 'e0000001-0000-0000-0000-000000000016', 3, 3, '10-12',NULL, 60, 'Leg curl',                                          FALSE),
  ('s0000001-0000-0000-0000-000000000002', 'e0000001-0000-0000-0000-000000000022', 4, 3, '12-15',NULL, 60, 'Cable crunch',                                      FALSE);

-- Upper B
INSERT INTO session_exercises (session_id, exercise_id, order_index, target_sets, target_reps, target_rpe, rest_seconds, notes, is_warmup) VALUES
  ('s0000001-0000-0000-0000-000000000003', 'e0000001-0000-0000-0000-000000000011', 0, 4, '5-6',  8.0, 180, 'Weighted pull-ups — add load progressively',        FALSE),
  ('s0000001-0000-0000-0000-000000000003', 'e0000001-0000-0000-0000-000000000002', 1, 3, '5',    8.0, 180, 'Paused bench — 2-second pause, control descent',    FALSE),
  ('s0000001-0000-0000-0000-000000000003', 'e0000001-0000-0000-0000-000000000013', 2, 3, '10-12',7.0, 90,  'Cable row — squeeze hard at contraction',           FALSE),
  ('s0000001-0000-0000-0000-000000000003', 'e0000001-0000-0000-0000-000000000003', 3, 3, '8-10', 7.0, 90,  'Close-grip bench — tricep builder',                 FALSE),
  ('s0000001-0000-0000-0000-000000000003', 'e0000001-0000-0000-0000-000000000018', 4, 3, '15-20',NULL, 60, 'Lateral raise — light, strict form',                FALSE),
  ('s0000001-0000-0000-0000-000000000003', 'e0000001-0000-0000-0000-000000000020', 5, 3, '10-12',NULL, 60, 'DB curl',                                           FALSE);

-- Lower B
INSERT INTO session_exercises (session_id, exercise_id, order_index, target_sets, target_reps, target_rpe, rest_seconds, notes, is_warmup) VALUES
  ('s0000001-0000-0000-0000-000000000004', 'e0000001-0000-0000-0000-000000000008', 0, 4, '4-6',  8.0, 240, 'Conv. deadlift — top set + back-offs',              FALSE),
  ('s0000001-0000-0000-0000-000000000004', 'e0000001-0000-0000-0000-000000000007', 1, 3, '5',    7.0, 180, 'Tempo squat 3-0-1 — keep position tight',           FALSE),
  ('s0000001-0000-0000-0000-000000000004', 'e0000001-0000-0000-0000-000000000009', 2, 3, '8',    7.0, 120, 'RDL — hamstring work after DL',                     FALSE),
  ('s0000001-0000-0000-0000-000000000004', 'e0000001-0000-0000-0000-000000000016', 3, 3, '10-12',NULL, 60, 'Leg curl',                                          FALSE),
  ('s0000001-0000-0000-0000-000000000004', 'e0000001-0000-0000-0000-000000000021', 4, 3, '8-10', NULL, 60, 'Ab wheel',                                          FALSE);

-- ─── Assign program to all users ─────────────────────────────
INSERT INTO user_program_assignments (user_id, program_id, assigned_by, is_active, current_session_index) VALUES
  ('00000000-0000-0000-0000-000000000001', 'p0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', TRUE, 0),
  ('00000000-0000-0000-0000-000000000002', 'p0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', TRUE, 1),
  ('00000000-0000-0000-0000-000000000003', 'p0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', TRUE, 2)
ON CONFLICT (user_id, program_id) DO NOTHING;

-- ─── Sample body metrics ─────────────────────────────────────
INSERT INTO body_metrics (user_id, date, bodyweight_kg) VALUES
  ('00000000-0000-0000-0000-000000000001', CURRENT_DATE - 14, 82.5),
  ('00000000-0000-0000-0000-000000000001', CURRENT_DATE - 7,  82.0),
  ('00000000-0000-0000-0000-000000000001', CURRENT_DATE,      81.8),
  ('00000000-0000-0000-0000-000000000002', CURRENT_DATE - 7,  90.2),
  ('00000000-0000-0000-0000-000000000002', CURRENT_DATE,      90.0)
ON CONFLICT (user_id, date) DO NOTHING;
