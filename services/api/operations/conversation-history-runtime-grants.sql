-- Apply after migration 030 when the API uses the restricted mural_runtime role.
GRANT SELECT,INSERT,DELETE ON conversation_events,conversation_learning_results TO mural_runtime;
-- Migration 030's invoker trigger serializes cursor allocation for old/new writers.
GRANT UPDATE(history_sequence) ON hosted_sessions TO mural_runtime;
