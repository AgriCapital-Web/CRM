UPDATE public.grille_remuneration
SET description='Palme Invest / Terra Palm — commission subvention unique, paiement à la quinzaine', updated_at=now()
WHERE code_regle='COMMERCIAL_ACQUISITION_PARTENAIRE';
UPDATE public.grille_remuneration
SET description='PalmTerroir — formule essentielle, commission subvention unique, paiement à la quinzaine', updated_at=now()
WHERE code_regle='COMMERCIAL_ACQUISITION_ESSENTIEL';
UPDATE public.grille_remuneration
SET description='PalmTerroir — formule flexible, commission subvention unique, paiement à la quinzaine', updated_at=now()
WHERE code_regle='COMMERCIAL_ACQUISITION_FLEXIBLE';