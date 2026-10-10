-- Normalise les libellés historiques courants vers leur code pays canonique.
update public.clients set nationalite='BF' where lower(trim(nationalite)) in ('burkinabè','burkinabe','burkinabé','burkinabe');
update public.client_cotitulaires_mandataires set nationalite='BF' where lower(trim(nationalite)) in ('burkinabè','burkinabe','burkinabé','burkinabe');
