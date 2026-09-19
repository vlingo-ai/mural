-- Apply after migration 024 and the existing actual-value runtime grants.
REVOKE ALL ON account_model_tasks,account_model_task_reconciliation FROM mural_runtime;
GRANT SELECT,INSERT ON account_model_tasks,account_model_task_reconciliation TO mural_runtime;
GRANT UPDATE(state,provider_response_id,input_tokens,cached_input_tokens,cache_write_tokens,
  output_tokens,search_calls,cost_nano,limit_breached,finished_at) ON account_model_tasks TO mural_runtime;
REVOKE ALL ON FUNCTION preserve_account_model_task(),check_account_model_task_reservation() FROM mural_runtime;
