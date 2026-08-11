-- Le contenu narratif n'est plus lisible d'avance.
--
-- La migration précédente alignait `narrative_beats` sur les autres tables de
-- contenu (`sports`, `classes`, `level_thresholds`) : lecture publique. La
-- comparaison ne tient pas. Ces tables décrivent les règles du jeu, celle-ci
-- porte l'histoire — et une histoire lue d'avance est une histoire perdue. Avec
-- la clé anon et une requête, on récupérait `body` pour les 47 beats du MVP,
-- y compris ceux d'un sport jamais pratiqué.
--
-- Le client ne voit donc plus que ce qu'il a débloqué. Trois conséquences à
-- avoir en tête :
--
-- 1. **L'API n'est pas concernée.** Elle utilise la clé `service_role`, qui
--    contourne la RLS : `NarrativeService` continue de lire tous les beats pour
--    déterminer lesquels débloquer. Sans ça, un beat non débloqué serait
--    invisible au calcul qui doit justement le débloquer — la policy se
--    mordrait la queue.
--
-- 2. **`anon` perd tout accès**, faute de policy le concernant. C'est cohérent :
--    un visiteur sans session n'a aucun déblocage, il n'avait donc rien à y
--    lire de légitime.
--
-- 3. **Le mobile ne régresse pas** : il lit le codex par `GET /narrative`, qui
--    ne servait déjà que les beats débloqués. Aucun écran ne requête cette
--    table en direct.
--
-- Le coût est un `exists` par ligne évaluée, sur la clé primaire de
-- `user_narrative_unlocks` — dont `(profile_id, beat_id)` est exactement le
-- couple filtré, donc l'index composite suffit, sans index supplémentaire.

drop policy "narrative_beats_select_public" on public.narrative_beats;

create policy "narrative_beats_select_unlocked"
  on public.narrative_beats for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_narrative_unlocks u
      where u.beat_id = narrative_beats.id
        and u.profile_id = (select auth.uid())
    )
  );

comment on table public.narrative_beats is
  'Contenu narratif. Écriture service_role uniquement ; lecture limitée aux beats que le lecteur a débloqués. Le déblocage ne dépend jamais de la classe du joueur.';
