-- Run this ONLY if your existing sih_safety.incidents table
-- was already created with user_id as INTEGER.
-- MongoDB user IDs are ObjectIds, so the combined backend stores user_id as TEXT.

ALTER TABLE incidents
ALTER COLUMN user_id TYPE TEXT
USING user_id::text;
