-- 007_preregister_users.sql
-- Allow pre-registering users before their first login.
-- Pre-registered users have external_id = NULL until they log in via Google OAuth.

ALTER TABLE users ALTER COLUMN external_id DROP NOT NULL;
