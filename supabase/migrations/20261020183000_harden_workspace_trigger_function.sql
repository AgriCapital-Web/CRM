-- Trigger-only function: authenticated users must not be able to call it as an RPC.
revoke all on function public.workspace_record_document_version() from public, anon, authenticated;
