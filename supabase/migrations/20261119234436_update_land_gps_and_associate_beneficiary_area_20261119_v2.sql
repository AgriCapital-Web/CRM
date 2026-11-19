
UPDATE public.clients SET latitude=6.997856,longitude=-6.214123
WHERE id_unique='AC_C000008' AND nom_complet='PAULIN LOUKOU';
UPDATE public.plantations p
SET localisation_gps_lat=6.997856,localisation_gps_lng=-6.214123,latitude=6.997856,longitude=-6.214123
FROM public.clients c WHERE p.client_id=c.id AND c.id_unique='AC_C000008';
UPDATE public.lots_hectares SET centroid_lat=6.997856,centroid_lng=-6.214123
WHERE reference='PAR-000008-L01';

UPDATE public.clients SET latitude=6.997856,longitude=-6.214114
WHERE id_unique='OWNER-AC-P000002';
UPDATE public.plantations p
SET localisation_gps_lat=6.997856,localisation_gps_lng=-6.214114,latitude=6.997856,longitude=-6.214114
FROM public.clients c WHERE p.client_id=c.id AND c.id_unique='OWNER-AC-P000002';
UPDATE public.proprietaires_terres SET coordonnees_gps='6.997856,-6.214114'
WHERE nom_complet='BOUKARY ZONGO' AND surface_totale_ha=6;
UPDATE public.parcelles SET localisation_gps_lat=6.997856,localisation_gps_lng=-6.214114
WHERE id_unique='PAR-000008';

UPDATE public.clients SET latitude=6.942856,longitude=-6.236825
WHERE id_unique='AC_C000009';
UPDATE public.plantations p
SET localisation_gps_lat=6.942856,localisation_gps_lng=-6.236825,latitude=6.942856,longitude=-6.236825
FROM public.clients c WHERE p.client_id=c.id AND c.id_unique='AC_C000009';
UPDATE public.parcelles SET localisation_gps_lat=6.942856,localisation_gps_lng=-6.236825
WHERE id_unique='PAR-000010';

UPDATE public.clients SET latitude=6.993066,longitude=-6.437648
WHERE id_unique='AC_B000001';
UPDATE public.plantations p
SET localisation_gps_lat=6.993066,localisation_gps_lng=-6.437648,latitude=6.993066,longitude=-6.437648
FROM public.clients c WHERE p.client_id=c.id AND c.id_unique='AC_B000001';

UPDATE public.clients SET latitude=6.994030,longitude=-6.440636
WHERE id_unique='OWNER-AC-P000001';
UPDATE public.plantations p
SET localisation_gps_lat=6.994030,localisation_gps_lng=-6.440636,latitude=6.994030,longitude=-6.440636
FROM public.clients c WHERE p.client_id=c.id AND c.id_unique='OWNER-AC-P000001';
UPDATE public.proprietaires_terres SET coordonnees_gps='6.994030,-6.440636'
WHERE nom_complet='ZAGBLE BOLOU JEAN-JACQUES' AND surface_totale_ha=4;
UPDATE public.parcelles SET localisation_gps_lat=6.994030,localisation_gps_lng=-6.440636
WHERE id_unique='PAR-000001';

UPDATE public.clients SET latitude=6.966816,longitude=-6.216460
WHERE id_unique='AC_C000004';
UPDATE public.plantations p
SET localisation_gps_lat=6.966816,localisation_gps_lng=-6.216460,latitude=6.966816,longitude=-6.216460
FROM public.clients c WHERE p.client_id=c.id AND c.id_unique='AC_C000004';
UPDATE public.parcelles SET localisation_gps_lat=6.966816,localisation_gps_lng=-6.216460
WHERE id_unique='PAR-000005';

UPDATE public.finance_associates
SET superficie_beneficiaire_ha=6.5,
    latitude=6.966916,
    longitude=-6.216489,
    notes=CASE
      WHEN position('Surface beneficiaire non facturable : 6,5 ha' in coalesce(notes,''))>0 THEN notes
      ELSE concat_ws(chr(10),nullif(notes,''),
        'Surface beneficiaire non facturable : 6,5 ha. GPS : 6.966916, -6.216489. Aucun echeancier ni dette client a creer.')
    END
WHERE full_name='Jacques Kouakou KOUAME'
  AND telephone='+2250152824598'
  AND active=true;
