-- Store rejection reason on users table (works even when profile row doesn't exist)
-- Run once on existing databases.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'rejection_reason') THEN
    ALTER TABLE users ADD COLUMN rejection_reason TEXT;
  END IF;
END $$;
