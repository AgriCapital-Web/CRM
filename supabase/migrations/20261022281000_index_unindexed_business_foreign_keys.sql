-- Index foreign-key columns used by CRM list joins, ownership checks and cleanup paths.
-- Existing PK/unique indexes and managed Supabase auth/storage indexes are left untouched.
create index if not exists idx_acquisitions_validation_par on public.acquisitions(validation_par);
create index if not exists idx_clients_validation_par on public.clients(validation_par);
create index if not exists idx_finance_historical_import_batches_created_by_profile_id on public.finance_historical_import_batches(created_by_profile_id);
create index if not exists idx_finance_historical_ledger_associate_id on public.finance_historical_ledger(associate_id);
create index if not exists idx_finance_historical_ledger_created_by_profile_id on public.finance_historical_ledger(created_by_profile_id);
create index if not exists idx_finance_historical_ledger_matched_transaction_id on public.finance_historical_ledger(matched_transaction_id);
create index if not exists idx_internal_conversations_created_by_profile_id on public.internal_conversations(created_by_profile_id);
create index if not exists idx_internal_meeting_provider_config_updated_by_profile_id on public.internal_meeting_provider_config(updated_by_profile_id);
create index if not exists idx_internal_meetings_created_by_profile_id on public.internal_meetings(created_by_profile_id);
create index if not exists idx_internal_message_reactions_profile_id on public.internal_message_reactions(profile_id);
create index if not exists idx_internal_message_receipts_profile_id on public.internal_message_receipts(profile_id);
create index if not exists idx_internal_messages_reply_to_id on public.internal_messages(reply_to_id);
create index if not exists idx_internal_messages_sender_profile_id on public.internal_messages(sender_profile_id);
create index if not exists idx_portefeuille_versement_paiements_created_by on public.portefeuille_versement_paiements(created_by);
create index if not exists idx_proprietaires_terres_validated_by on public.proprietaires_terres(validated_by);
create index if not exists idx_workspace_document_comments_author_profile_id on public.workspace_document_comments(author_profile_id);
create index if not exists idx_workspace_document_members_created_by_profile_id on public.workspace_document_members(created_by_profile_id);
create index if not exists idx_workspace_document_versions_changed_by_profile_id on public.workspace_document_versions(changed_by_profile_id);
