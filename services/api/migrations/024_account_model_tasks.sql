-- Billing metadata for one-shot work outside a Live session. No prompts, queries, output,
-- schemas, transcript text, model names or provider credentials are stored here.
CREATE TABLE account_model_tasks (
  request_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id),
  purpose text NOT NULL CHECK (purpose='topic'),
  search_requested boolean NOT NULL CHECK (search_requested),
  input_token_ceiling integer NOT NULL CHECK (input_token_ceiling BETWEEN 1 AND 5000000),
  output_token_ceiling integer NOT NULL CHECK (output_token_ceiling=1400),
  hold_nano bigint NOT NULL CHECK (hold_nano>0),
  active_until timestamptz NOT NULL,
  reservation_id uuid NOT NULL UNIQUE REFERENCES reservations(id),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','settled','uncertain')),
  provider_response_id text UNIQUE CHECK (provider_response_id ~ '^resp_[A-Za-z0-9_-]{1,200}$'),
  input_tokens bigint CHECK (input_tokens>=0),
  cached_input_tokens bigint CHECK (cached_input_tokens>=0),
  cache_write_tokens bigint CHECK (cache_write_tokens>=0),
  output_tokens bigint CHECK (output_tokens>=0),
  search_calls integer CHECK (search_calls>=0),
  cost_nano bigint CHECK (cost_nano>=0),
  limit_breached boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (active_until>created_at AND active_until<=created_at+interval '65 seconds'),
  CHECK (cached_input_tokens+cache_write_tokens<=input_tokens),
  CHECK ((state='settled' AND provider_response_id IS NOT NULL AND input_tokens IS NOT NULL
    AND cached_input_tokens IS NOT NULL AND cache_write_tokens IS NOT NULL AND output_tokens IS NOT NULL
    AND search_calls IS NOT NULL AND cost_nano IS NOT NULL AND finished_at IS NOT NULL) OR
    (state<>'settled' AND provider_response_id IS NULL AND input_tokens IS NULL AND cached_input_tokens IS NULL
    AND cache_write_tokens IS NULL AND output_tokens IS NULL AND search_calls IS NULL AND cost_nano IS NULL)),
  CHECK (state='pending' OR finished_at IS NOT NULL)
);
CREATE INDEX account_model_tasks_account_created ON account_model_tasks(account_id,created_at DESC);
CREATE INDEX account_model_tasks_unresolved ON account_model_tasks(active_until) WHERE state<>'settled';

CREATE FUNCTION preserve_account_model_task() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.state<>'pending' OR ROW(NEW.request_id,NEW.account_id,NEW.purpose,NEW.search_requested,
    NEW.input_token_ceiling,NEW.output_token_ceiling,NEW.hold_nano,NEW.active_until,NEW.reservation_id,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.request_id,OLD.account_id,OLD.purpose,OLD.search_requested,
    OLD.input_token_ceiling,OLD.output_token_ceiling,OLD.hold_nano,OLD.active_until,OLD.reservation_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Account model task is immutable';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER account_model_task_immutable BEFORE UPDATE ON account_model_tasks
  FOR EACH ROW EXECUTE FUNCTION preserve_account_model_task();

CREATE FUNCTION check_account_model_task_reservation() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM reservations r WHERE r.id=NEW.reservation_id AND r.account_id=NEW.account_id
    AND r.reserved_nano=NEW.hold_nano AND r.idempotency_key='account-model-task:'||NEW.request_id::text
    AND r.rate_version LIKE '%-helper-cache-write-long-context-v1' AND r.state='open') THEN
    RAISE EXCEPTION 'Invalid account model task reservation';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER account_model_task_reservation_check BEFORE INSERT ON account_model_tasks
  FOR EACH ROW EXECUTE FUNCTION check_account_model_task_reservation();

CREATE TABLE account_model_task_reconciliation (
  reference text PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES account_model_tasks(request_id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  provider_response_id text NOT NULL,
  usage jsonb NOT NULL CHECK (jsonb_typeof(usage)='object'),
  provider_cost_nano bigint NOT NULL CHECK (provider_cost_nano>=0),
  reason text NOT NULL CHECK (reason='hold_exceeded'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER account_model_task_reconciliation_immutable BEFORE UPDATE OR DELETE ON account_model_task_reconciliation
  FOR EACH ROW EXECUTE FUNCTION immutable_ledger();
REVOKE ALL ON FUNCTION preserve_account_model_task(),check_account_model_task_reservation() FROM PUBLIC;
