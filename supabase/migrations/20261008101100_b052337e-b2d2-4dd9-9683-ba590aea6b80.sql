DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'departements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.departements;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sous_prefectures'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sous_prefectures;
  END IF;
END $$;
