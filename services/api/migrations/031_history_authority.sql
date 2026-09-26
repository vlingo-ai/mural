-- Admission-time ownership is immutable across later configuration changes.
-- Existing sessions and old providers remain browser-authoritative.
ALTER TABLE hosted_sessions ADD COLUMN history_authority text NOT NULL DEFAULT 'client'
  CHECK(history_authority IN ('client','worker'));
