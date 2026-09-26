-- Allocate per-session positions under a row lock held until commit. Unlike a
-- global sequence, a later committed event cannot overtake an uncommitted one.
ALTER TABLE hosted_sessions ADD COLUMN history_sequence bigint NOT NULL DEFAULT 0;
ALTER TABLE conversation_events ADD COLUMN position bigint;
WITH numbered AS (
  SELECT id,row_number() OVER (PARTITION BY session_id ORDER BY created_at,id) AS n
  FROM conversation_events
) UPDATE conversation_events e SET position=n.n FROM numbered n WHERE e.id=n.id;
UPDATE hosted_sessions s SET history_sequence=x.n FROM
  (SELECT session_id,max(position) AS n FROM conversation_events GROUP BY session_id) x
  WHERE s.id=x.session_id;
ALTER TABLE conversation_events ALTER COLUMN position SET NOT NULL;
ALTER TABLE conversation_events ADD CHECK(position > 0);
CREATE UNIQUE INDEX conversation_events_position ON conversation_events(session_id,position);
CREATE FUNCTION assign_history_position() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE hosted_sessions SET history_sequence=history_sequence+1
    WHERE id=NEW.session_id RETURNING history_sequence INTO NEW.position;
  RETURN NEW;
END;
$$;
CREATE TRIGGER conversation_event_position BEFORE INSERT ON conversation_events
FOR EACH ROW EXECUTE FUNCTION assign_history_position();
