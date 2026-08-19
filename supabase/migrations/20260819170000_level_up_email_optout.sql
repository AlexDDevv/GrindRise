-- Se désabonner des emails de palier.
--
-- Obligation légale avant toute ouverture publique (CAN-SPAM, RGPD/ePrivacy) :
-- un email automatisé qui n'est pas strictement transactionnel doit pouvoir
-- être refusé. L'email de palier en est un — il célèbre une progression, il ne
-- répond à aucune action que le destinataire vient de demander. Le code de
-- connexion OTP, lui, reste transactionnel : il répond à une demande explicite,
-- il n'est pas concerné et ne doit surtout pas devenir refusable.
--
-- Pourquoi une colonne sur `profiles` plutôt qu'une table de préférences :
-- il n'y a qu'une préférence aujourd'hui, et `profiles` est déjà lu à chaque
-- enregistrement de séance. Vérifier le drapeau avant de produire le job ne
-- coûte donc aucune requête supplémentaire. Une table dédiée se justifiera le
-- jour où les canaux se multiplieront (push, résumé hebdomadaire) ; la colonne
-- s'y déplacera alors sans perte.
--
-- Aucune policy à ajouter, et c'est délibéré : `profiles_update_own` autorise
-- déjà le propriétaire à écrire son profil, cette colonne comprise. C'est
-- exactement la règle voulue — une préférence d'utilisateur s'écrit par
-- l'utilisateur, pas seulement par le `service_role`. Une policy spécifique ne
-- ferait que répéter ce qui tient déjà.
--
-- Le lien de désabonnement d'un email, lui, est suivi sans session : il n'y a
-- aucun `auth.uid()` à ce moment-là. C'est l'API qui écrit alors la colonne
-- avec la clé `service_role`, après avoir vérifié la signature du jeton porté
-- par l'URL. Le lien tient donc lieu de preuve d'identité, à la place du JWT.

alter table public.profiles
  add column notify_level_up boolean not null default true;

comment on column public.profiles.notify_level_up is
  'Faux = ne plus recevoir les emails de palier. Vérifié par l''API avant de produire le job de notification, jamais côté worker : un job qui ne doit pas exister ne doit pas être empilé.';
