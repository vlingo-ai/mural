-- A LiveKit room can exist before the upstream GPT-Live WebSocket is accepted.
-- Preserve that provider identifier while allowing a proven pre-session 4xx to release funding.
ALTER TABLE hosted_sessions DROP CONSTRAINT hosted_rejection_evidence;
ALTER TABLE hosted_sessions ADD CONSTRAINT hosted_rejection_evidence CHECK (
  (provider_rejection_status IS NULL AND provider_rejection_request_id IS NULL) OR
  (provider_rejection_status IS NOT NULL AND provider_rejection_status BETWEEN 400 AND 499 AND provider_rejection_status<>408
    AND (provider_rejection_request_id IS NULL OR provider_rejection_request_id ~ '^[A-Za-z0-9_-]{1,128}$')
    AND state='closed' AND observed_ms=0
    AND provider_cost_nano IS NOT NULL AND provider_cost_nano=0 AND funding_exposure_nano=0
    AND COALESCE(charged_ms,charged_nano) IS NOT NULL AND COALESCE(charged_ms,charged_nano)=0
    AND ((provider_session_id IS NULL AND close_reason='provider_create_rejected') OR
      (provider_session_id IS NOT NULL AND close_reason='provider_runtime_rejected')))) NOT VALID;
