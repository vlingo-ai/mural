-- Product selectors expose only current launch languages. Keep the stored provider locale
-- open for older native clients and historical rows; request admission remains allowlisted.
ALTER TABLE hosted_sessions DROP CONSTRAINT IF EXISTS hosted_session_language;
