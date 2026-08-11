-- Ce qu'il faut pour calculer un streak déterministe dans le fuseau du joueur.
--
-- Deux colonnes, deux problèmes distincts :
--
-- 1. `profiles.timezone` — un streak compté en UTC casse à minuit UTC, soit
--    2 h du matin en France : une séance du samedi soir tomberait dans la
--    journée de dimanche. Le découpage en jours doit donc se faire dans le
--    fuseau du joueur.
--
--    Le fuseau vit sur le profil et non sur chaque séance parce que le streak
--    est recalculé rétroactivement sur tout l'historique : s'il était porté par
--    la séance, il faudrait arbitrer entre deux séances de fuseaux différents.
--    Une seule valeur appliquée à tout l'historique rend le recalcul
--    déterministe. Contrepartie assumée : voyager redécoupe l'historique.
--
-- 2. `user_progress.last_workout_on` — sans elle, `streak_days` est
--    indécidable : « 10 » ne distingue pas « 10 jours en cours » de « 10 jours
--    éteints depuis mars ». Les deux alternatives sont pires : remettre la
--    valeur à 0 quand la chaîne meurt demanderait une tâche quotidienne (rien
--    n'en exécute avant la phase 5), et ne rien stocker laisserait le compteur
--    affiché à 0 alors que la table le porte déjà.
--
--    Elle reste un cache au même titre que `streak_days` : recalculée par le
--    même code, depuis la même source (`workout_logs`).

-- ---------------------------------------------------------------------------
-- Fuseau horaire du joueur
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column timezone text not null default 'Europe/Paris';

comment on column public.profiles.timezone is
  'Fuseau IANA servant à découper les séances en jours locaux (streak, plafonds journaliers).';

-- La policy `profiles_update_own` autorise le client à écrire cette colonne, et
-- elle pilote un calcul de jeu : un fuseau inconnu doit être refusé par la
-- base, pas découvert plus tard par le serveur au moment du calcul.
--
-- Un CHECK ne peut pas faire ce travail : la liste des fuseaux est une vue
-- système, donc la vérification n'est pas immuable. D'où le trigger.
create or replace function public.profiles_validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Lève `invalid_parameter_value` si le fuseau n'existe pas.
  perform now() at time zone new.timezone;
  return new;
end;
$$;

create trigger profiles_timezone_valid
  before insert or update of timezone on public.profiles
  for each row execute function public.profiles_validate_timezone();

-- ---------------------------------------------------------------------------
-- Dernier jour porteur d'une séance
-- ---------------------------------------------------------------------------

alter table public.user_progress
  add column last_workout_on date;

comment on column public.user_progress.last_workout_on is
  'Dernier jour LOCAL portant une séance. Null tant qu''aucune séance n''a été enregistrée. Avec streak_days, permet au client de dire si la chaîne est vivante sans requête supplémentaire.';
