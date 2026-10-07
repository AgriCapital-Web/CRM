-- ====================================================================
-- SCRIPT SQL À EXÉCUTER MANUELLEMENT DANS SUPABASE
-- Pour configurer le système de notifications et demandes de compte
-- ====================================================================

-- 1. Créer la table notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Créer la table account_requests
CREATE TABLE IF NOT EXISTS public.account_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_complet TEXT NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT NOT NULL,
  poste_souhaite TEXT NOT NULL,
  role_souhaite TEXT NOT NULL,
  departement TEXT,
  justification TEXT NOT NULL,
  cv_url TEXT,
  photo_url TEXT,
  statut TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'approuve', 'rejete')),
  motif_rejet TEXT,
  traite_par UUID REFERENCES auth.users(id),
  traite_le TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Créer la table activity_notes
CREATE TABLE IF NOT EXISTS public.activity_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Activer RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_notes ENABLE ROW LEVEL SECURITY;

-- 5. Créer les policies RLS pour notifications
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

-- 6. Créer les policies RLS pour account_requests
CREATE POLICY "Anyone can create account request"
  ON public.account_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Super admins can view all account requests"
  ON public.account_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can update account requests"
  ON public.account_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- 7. Créer les policies RLS pour activity_notes
CREATE POLICY "Users can view their own notes"
  ON public.activity_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own notes"
  ON public.activity_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 8. Activer le realtime pour notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.account_requests;

-- 9. Créer les indexes pour performances
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_requests_statut ON public.account_requests(statut);
CREATE INDEX IF NOT EXISTS idx_activity_notes_entity ON public.activity_notes(entity_type, entity_id);

-- 10. Fonction pour envoyer des notifications à la hiérarchie
CREATE OR REPLACE FUNCTION public.notify_hierarchy(
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_data JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
BEGIN
  -- Notifier: super_admin, directeur_technico_commercial, responsable_zone, chef_equipe
  FOR v_user IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('super_admin', 'directeur_technico_commercial', 'responsable_zone', 'chef_equipe')
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (v_user.user_id, p_type, p_title, p_message, p_data);
  END LOOP;
END;
$$;

-- 11. Trigger pour notifier lors d'une nouvelle souscription
CREATE OR REPLACE FUNCTION public.notify_new_souscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_hierarchy(
    'nouvelle_souscription',
    'Nouvelle souscription',
    'Une nouvelle souscription a été créée pour ' || NEW.nom_famille || ' ' || NEW.prenoms,
    jsonb_build_object('souscription_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_new_souscription
  AFTER INSERT ON public.souscripteur
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_souscription();

-- 12. Trigger pour notifier lors d'un nouveau paiement
CREATE OR REPLACE FUNCTION public.notify_new_paiement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_hierarchy(
    'nouveau_paiement',
    'Nouveau paiement',
    'Un nouveau paiement de ' || NEW.montant || ' FCFA a été enregistré',
    jsonb_build_object('paiement_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_new_paiement
  AFTER INSERT ON public.paiement
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_paiement();

-- 13. Ajouter le bucket storage pour les documents si pas existant
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- 14. Policy storage pour permettre l'upload
CREATE POLICY "Anyone can upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Anyone can view documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents');

-- ====================================================================
-- FIN DU SCRIPT
-- Exécutez ce script dans: Cloud > Database > SQL Editor
-- ====================================================================
