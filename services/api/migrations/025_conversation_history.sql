-- Phase 5 Web history. Audio, SDP, provider identifiers and credentials are never stored here.
ALTER TABLE hosted_sessions ADD COLUMN language text;

CREATE TABLE conversation_events (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES hosted_sessions(id),
  provider_event_id text NOT NULL,
  speaker text NOT NULL CHECK (speaker IN ('user','assistant')),
  text text NOT NULL CHECK (octet_length(text) BETWEEN 1 AND 4000),
  source text NOT NULL CHECK (source IN ('live','typed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id,provider_event_id)
);
CREATE INDEX conversation_events_session_order ON conversation_events(session_id,created_at,id);

CREATE TABLE conversation_learning_results (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES hosted_sessions(id),
  idempotency_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('translation','assessment','teachingReply','topicSearch')),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id,idempotency_key)
);
CREATE INDEX conversation_results_session_order ON conversation_learning_results(session_id,created_at,id);
