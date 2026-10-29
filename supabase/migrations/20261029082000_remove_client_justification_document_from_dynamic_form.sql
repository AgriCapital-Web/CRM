-- Retire the former client justification upload from the dynamic acquisition form.
-- Do not drop a clients column: the live schema has no dedicated justification/ANSS
-- column. Historical documents_acquisition rows and stored files are deliberately
-- preserved; this migration only removes obsolete form configuration entries.
delete from public.offre_formulaire_documents
where lower(trim(coalesce(code, ''))) in (
  'document_justificatif',
  'dossier_justificatif',
  'justificatif_client',
  'document_annexe_anss',
  'anss'
)
or lower(trim(coalesce(libelle, ''))) in (
  'document justificatif',
  'dossier justificatif',
  'pièce justificative',
  'piece justificative',
  'document annexe anss'
);