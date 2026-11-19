UPDATE public.account_requests
SET role_souhaite='chef_equipe_commercial',
    poste_souhaite='Chef d’équipe commerciale',
    telephone='+2250703537932',
    telephone_indicatif='+225',
    telephone_local='0703537932',
    updated_at=now()
WHERE id='ba094701-7134-4c8f-b6fb-56e0b4c659d3'
  AND auth_user_id='bc0da3ca-97c4-49c5-886d-4312590c4615'
  AND statut='en_attente'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id='bc0da3ca-97c4-49c5-886d-4312590c4615'
      AND role='chef_equipe_commercial'
  );