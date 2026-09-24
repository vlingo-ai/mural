-- External resource lifecycle is independent of wallet settlement. Persist intent
-- before CreateRoom so a crash/ambiguous reply cannot lose the room's known name.
CREATE TABLE hosted_resource_cleanup (
  session_id uuid PRIMARY KEY REFERENCES hosted_sessions(id),
  provider text NOT NULL CHECK (provider='livekit-room'),
  resource_id text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'armed' CHECK (state IN ('armed','pending','confirmed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state='confirmed') = (confirmed_at IS NOT NULL))
);
CREATE INDEX hosted_resource_cleanup_due ON hosted_resource_cleanup(next_attempt_at)
  WHERE state<>'confirmed';
-- No retrospective deletion of historical rooms: their provider/environment is
-- not durably identified by old hosted_sessions rows. Audit them separately.
