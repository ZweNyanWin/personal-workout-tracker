ALTER TABLE workout_logs
  ADD COLUMN IF NOT EXISTS energy_rating SMALLINT CHECK (energy_rating BETWEEN 1 AND 5);
