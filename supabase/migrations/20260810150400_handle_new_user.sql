-- Création automatique des lignes qui accompagnent un compte.
--
-- Sans ce trigger, le mobile devrait créer son profil lui-même après le
-- signup : il existerait alors une fenêtre pendant laquelle un utilisateur est
-- authentifié mais n'a ni profil, ni progression, ni droits — et toute
-- interruption (crash, perte réseau) laisserait un compte définitivement
-- inutilisable.
--
-- `security definer` est nécessaire : le trigger s'exécute dans le contexte de
-- l'inscription, qui n'a pas les droits d'écriture sur public.
-- `set search_path = ''` impose de qualifier chaque nom, ce qui empêche le
-- détournement de la fonction par un schéma malveillant placé en tête de path.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.user_progress (profile_id) values (new.id);
  -- Tout le monde démarre en freemium actif : le gating serveur peut ainsi
  -- toujours lire une ligne, sans avoir à traiter le cas « absente ».
  insert into public.entitlements (profile_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
