-- Ce qu'est « être abonné », écrit une fois.
--
-- La comparaison naïve `plan <> 'freemium'` rate trois cas, et chacun d'eux
-- retirerait un accès payé :
--
-- - `lifetime` n'a pas d'`expires_at` (voir core_schema.sql) : toute condition
--   qui exige une échéance future le déclarerait expiré le jour de l'achat ;
-- - `cancelled` désigne un abonnement qui ne se renouvellera pas, pas un accès
--   déjà retiré. Le terme est payé jusqu'à `expires_at` ;
-- - `in_grace_period` est un incident de facturation. RevenueCat laisse
--   plusieurs jours au paiement pour aboutir ; couper l'accès entre-temps
--   punirait une carte expirée.
--
-- Elle est ici et non côté API parce que la garde du sport actif s'exécute dans
-- une transaction Postgres, et qu'une seconde définition côté Nest divergerait
-- au premier changement.
--
-- `stable` et non `volatile` : le planificateur peut la mémoriser le temps
-- d'une requête. Pas `immutable` — elle lit des tables et dépend de `now()`.

alter table public.entitlements
  add column last_event_at timestamptz;

comment on column public.entitlements.last_event_at is
  'Horodatage du dernier événement RevenueCat appliqué. Sert à ignorer un rejeu périmé, que `updated_at` ne permet pas de détecter : celui-ci date de l''écriture, pas de l''événement.';

create or replace function public.has_premium_access(p_profile_id uuid)
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select exists (
    select 1
    from public.entitlements e
    where e.profile_id = p_profile_id
      and e.plan <> 'freemium'
      and e.status <> 'expired'
      and (e.expires_at is null or e.expires_at > now())
  )
$$;

comment on function public.has_premium_access(uuid) is
  'Vrai si le profil a un droit payant en cours. Source unique : toute garde payante l''appelle plutôt que de recomposer la condition.';

-- La fonction est appelée depuis des fonctions `security definer` et depuis
-- l'API en service_role. `authenticated` y a accès en lecture pour que le
-- mobile puisse un jour l'interroger sans passer par l'API ; elle ne révèle
-- rien qu'un utilisateur ne puisse déjà lire sur sa propre ligne.
grant execute on function public.has_premium_access(uuid) to authenticated, service_role;
