CREATE OR REPLACE VIEW public.v_workspace_organization_chart AS
WITH staff_base AS (
  SELECT
    p.id AS profile_id,
    p.user_id,
    p.nom_complet AS employee_name,
    p.photo_url AS employee_photo_url,
    p.genre,
    p.poste,
    p.departement,
    p.actif,
    COALESCE(ur.role, ''::text) AS role_code,
    COALESCE(ar.nom, NULLIF(p.poste, ''::text), 'Collaborateur'::text) AS role_name,
    COALESCE(ar.niveau, 99) AS role_level,
    COALESCE(p.equipe_id, em.equipe_id) AS team_id,
    e.nom AS team_name,
    e.responsable_id AS team_responsable_id,
    e.superviseur_id AS team_superviseur_id,
    COALESCE(p.region_id, zr.zone_id) AS effective_region_id,
    COALESCE(p.district_id, zd.zone_id, r.district_id) AS effective_district_id,
    r.nom AS region_name,
    d.nom AS district_name
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT ur0.role FROM public.user_roles ur0
    WHERE ur0.user_id = p.user_id AND ur0.is_primary IS TRUE
    ORDER BY ur0.created_at DESC LIMIT 1
  ) ur ON true
  LEFT JOIN public.app_roles ar ON ar.code = ur.role
  LEFT JOIN LATERAL (
    SELECT em0.equipe_id FROM public.equipe_membres em0
    WHERE em0.profile_id = p.id ORDER BY em0.created_at DESC LIMIT 1
  ) em ON true
  LEFT JOIN public.equipes e ON e.id = COALESCE(p.equipe_id, em.equipe_id)
  LEFT JOIN LATERAL (
    SELECT za.zone_id FROM public.zone_assignments za
    WHERE za.user_id = p.user_id AND lower(za.zone_type) = ANY (ARRAY['region'::text, 'région'::text])
    ORDER BY za.created_at DESC LIMIT 1
  ) zr ON true
  LEFT JOIN LATERAL (
    SELECT za.zone_id FROM public.zone_assignments za
    WHERE za.user_id = p.user_id AND lower(za.zone_type) = 'district'::text
    ORDER BY za.created_at DESC LIMIT 1
  ) zd ON true
  LEFT JOIN public.regions r ON r.id = COALESCE(p.region_id, zr.zone_id)
  LEFT JOIN public.districts d ON d.id = COALESCE(p.district_id, zd.zone_id, r.district_id)
  WHERE p.actif IS DISTINCT FROM false
),
ranked AS (
  SELECT
    employee.profile_id,
    employee.user_id,
    employee.employee_name,
    employee.employee_photo_url,
    employee.genre AS employee_gender,
    employee.poste,
    employee.departement,
    employee.actif,
    employee.role_code,
    employee.role_name,
    employee.role_level,
    employee.team_id,
    employee.team_name,
    employee.team_responsable_id,
    employee.team_superviseur_id,
    employee.effective_region_id,
    employee.effective_district_id,
    employee.region_name,
    employee.district_name,
    manager.profile_id AS manager_profile_id,
    manager.employee_name AS manager_name,
    manager.employee_photo_url AS manager_photo_url,
    row_number() OVER (
      PARTITION BY employee.profile_id
      ORDER BY (
        CASE
          WHEN employee.team_responsable_id = manager.profile_id
            OR employee.team_responsable_id = manager.user_id
            OR employee.team_superviseur_id = manager.profile_id
            OR employee.team_superviseur_id = manager.user_id THEN 0
          WHEN employee.team_id IS NOT NULL AND manager.team_id = employee.team_id THEN 1
          WHEN employee.effective_district_id IS NOT NULL AND manager.effective_district_id = employee.effective_district_id THEN 2
          WHEN employee.effective_region_id IS NOT NULL AND manager.effective_region_id = employee.effective_region_id THEN 3
          ELSE 4
        END
      ),
      manager.role_level,
      manager.employee_name
    ) AS manager_rank
  FROM staff_base employee
  LEFT JOIN staff_base manager
    ON manager.profile_id <> employee.profile_id
    AND employee.role_level > 1
    AND (
      employee.team_responsable_id = manager.profile_id
      OR employee.team_responsable_id = manager.user_id
      OR employee.team_superviseur_id = manager.profile_id
      OR employee.team_superviseur_id = manager.user_id
      OR (employee.role_level = 2 AND manager.role_level = 1)
      OR (employee.role_level = 3 AND manager.role_level = 2)
      OR (employee.role_level = 4 AND manager.role_level = 2)
      OR (
        manager.role_level < employee.role_level
        AND (
          (employee.team_id IS NOT NULL AND manager.team_id = employee.team_id)
          OR (employee.effective_district_id IS NOT NULL AND manager.effective_district_id = employee.effective_district_id)
          OR (employee.effective_region_id IS NOT NULL AND manager.effective_region_id = employee.effective_region_id)
        )
      )
    )
)
SELECT
  profile_id AS id,
  profile_id,
  manager_profile_id,
  employee_name,
  employee_photo_url,
  role_code,
  role_name,
  role_level,
  team_id,
  team_name,
  effective_region_id AS region_id,
  region_name,
  effective_district_id AS district_id,
  district_name,
  manager_name,
  manager_photo_url,
  role_level > 1 AND manager_profile_id IS NULL AS rattachement_a_verifier,
  employee_gender
FROM ranked
WHERE manager_rank = 1 OR manager_rank IS NULL;
