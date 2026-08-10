-- Données de référence.
--
-- Elles vivent dans une migration et non dans `seed.sql` : `seed.sql` n'est
-- rejoué que par `db reset` en local, alors que ces lignes doivent exister en
-- production. Tout est écrit en `on conflict do update` pour rester rejouable.
--
-- ⚠️  CONTENU PROVISOIRE : les noms de sports, les classes, leur lore et les
--     titres de niveaux sont des valeurs de remplissage destinées à débloquer
--     l'onboarding. C'est du contenu de game design, à réécrire.

-- ---------------------------------------------------------------------------
-- Sports
-- ---------------------------------------------------------------------------

insert into public.sports (id, name, icon) values
  ('musculation', 'Musculation', 'barbell'),
  ('course',      'Course à pied', 'walk'),
  ('natation',    'Natation', 'water'),
  ('cyclisme',    'Cyclisme', 'bicycle')
on conflict (id) do update
  set name = excluded.name,
      icon = excluded.icon;

-- ---------------------------------------------------------------------------
-- Classes
--
-- Toutes génériques (`sport_id` null) pour le MVP : elles décrivent une
-- manière de s'entraîner, pas une discipline. Des classes spécifiques à un
-- sport pourront être ajoutées ensuite sans rien casser.
-- ---------------------------------------------------------------------------

insert into public.classes (id, sport_id, name, lore_intro) values
  (
    'berserker', null, 'Berserker',
    'Tu ne négocies pas avec la fonte, tu la soumets. Là où d''autres comptent leurs répétitions, tu comptes ce qui a cédé avant toi. Ta progression se mesure en charges brisées.'
  ),
  (
    'sentinelle', null, 'Sentinelle',
    'Ta force n''est pas dans l''éclat, elle est dans le retour. Chaque jour où tu te présentes, la faille se referme un peu. Ceux qui brillent une semaine s''éteignent ; toi, tu tiens le mur.'
  ),
  (
    'nomade', null, 'Nomade',
    'Le souffle avant la fureur, la distance avant la charge. Tu avances quand les autres s''arrêtent, et le terrain finit toujours par céder le premier.'
  ),
  (
    'ascete', null, 'Ascète',
    'Le geste juste, mille fois. Tu ne cherches pas le poids mais la maîtrise, et tu sais que la technique survit à la force. Ta discipline est ta seule arme — elle suffit.'
  )
on conflict (id) do update
  set sport_id   = excluded.sport_id,
      name       = excluded.name,
      lore_intro = excluded.lore_intro;

-- ---------------------------------------------------------------------------
-- Courbe de niveaux
--
-- Croissance géométrique : le premier palier coûte 100 XP, chaque palier
-- suivant vaut 1,15 × le précédent. Les premiers niveaux tombent donc vite
-- (onboarding) et la courbe s'étale ensuite (rétention long terme).
--
-- `xp_required` est l'XP TOTAL cumulé pour atteindre le niveau, pas le coût du
-- palier — c'est ce qui permet de déduire le niveau d'un simple
-- `max(level) where xp_required <= current_xp`.
--
-- Rééquilibrer le jeu = rejouer ce bloc avec d'autres constantes. Aucun
-- redéploiement de l'app n'est nécessaire.
-- ---------------------------------------------------------------------------

with recursive curve as (
  select
    1 as level,
    0::numeric as gap,
    0::numeric as total
  union all
  select
    c.level + 1,
    case when c.level = 1 then 100::numeric else round(c.gap * 1.15) end,
    c.total + case when c.level = 1 then 100::numeric else round(c.gap * 1.15) end
  from curve c
  where c.level < 50
)
insert into public.level_thresholds (level, xp_required, title)
select
  c.level,
  c.total::int,
  case
    when c.level >= 50 then 'Légende'
    when c.level >= 40 then 'Maître'
    when c.level >= 30 then 'Vétéran'
    when c.level >= 20 then 'Aguerri'
    when c.level >= 10 then 'Initié'
    else 'Novice'
  end
from curve c
on conflict (level) do update
  set xp_required = excluded.xp_required,
      title       = excluded.title;
