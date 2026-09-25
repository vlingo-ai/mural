-- A trusted final arriving after settlement is retained without rewriting a
-- user's charge. Store counters only, never transcripts or credentials.
CREATE TABLE hosted_final_reconciliation (
  session_id uuid PRIMARY KEY REFERENCES hosted_sessions(id),
  reported_ms bigint NOT NULL CHECK (reported_ms>=0),
  settled_observed_ms bigint NOT NULL CHECK (settled_observed_ms>=0),
  reason text NOT NULL CHECK (reason IN ('late_final','conflicting_final')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER hosted_final_reconciliation_immutable BEFORE UPDATE OR DELETE ON hosted_final_reconciliation
  FOR EACH ROW EXECUTE FUNCTION immutable_ledger();
