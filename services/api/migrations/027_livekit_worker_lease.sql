ALTER TABLE hosted_sessions
  ADD COLUMN provider_lease_expires_at timestamptz,
  ADD COLUMN provider_usage_final boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN hosted_sessions.provider_lease_expires_at IS
  'Expiry of the authenticated worker control lease; null for direct provider sidebands.';
COMMENT ON COLUMN hosted_sessions.provider_usage_final IS
  'False when a worker lease expired and settlement used the last trusted cumulative usage.';
