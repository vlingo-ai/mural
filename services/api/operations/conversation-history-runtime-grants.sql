-- Apply after migration 026 when the API uses the restricted mural_runtime role.
GRANT SELECT,INSERT,DELETE ON conversation_events,conversation_learning_results TO mural_runtime;
