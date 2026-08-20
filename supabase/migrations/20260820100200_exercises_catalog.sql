-- Catalogue d'exercices prédéfinis.
--
-- Dans une migration et non dans `seed.sql`, pour la même raison que
-- `reference_data.sql` : `seed.sql` n'est rejoué que par `db reset` en local,
-- alors que ces lignes doivent exister en production.
--
-- Rejouable : `on conflict do update` sur l'index unique partiel
-- `exercises_predefined_name_idx`. Renommer un exercice ici crée une nouvelle
-- ligne au lieu d'en modifier une — c'est le nom qui est la clé fonctionnelle.
--
-- ⚠️  CONTENU : ce sont des noms d'usage, pas un référentiel. Ils peuvent être
--     réécrits sans toucher au schéma, et c'est pour ça qu'ils vivent dans
--     leur propre migration.

insert into public.exercises (name, muscle_group) values
  ('Développé couché',              'pectoraux'),
  ('Développé incliné aux haltères','pectoraux'),
  ('Écarté à la poulie',            'pectoraux'),
  ('Pompes',                        'pectoraux'),

  ('Soulevé de terre',              'dos'),
  ('Tractions',                     'dos'),
  ('Rowing barre',                  'dos'),
  ('Tirage vertical',               'dos'),
  ('Rowing haltère un bras',        'dos'),

  ('Développé militaire',           'epaules'),
  ('Élévations latérales',          'epaules'),
  ('Élévations postérieures',       'epaules'),
  ('Face pull',                     'epaules'),

  ('Curl barre',                    'biceps'),
  ('Curl incliné aux haltères',     'biceps'),
  ('Curl marteau',                  'biceps'),

  ('Dips',                          'triceps'),
  ('Extension à la poulie haute',   'triceps'),
  ('Barre au front',                'triceps'),

  ('Curl poignets',                 'avant_bras'),
  ('Suspension à la barre',         'avant_bras'),

  ('Squat',                         'quadriceps'),
  ('Presse à cuisses',              'quadriceps'),
  ('Fentes',                        'quadriceps'),
  ('Leg extension',                 'quadriceps'),

  ('Soulevé de terre jambes tendues','ischios'),
  ('Leg curl',                      'ischios'),

  ('Hip thrust',                    'fessiers'),
  ('Abduction à la poulie',         'fessiers'),

  ('Mollets debout',                'mollets'),
  ('Mollets assis',                 'mollets'),

  ('Gainage',                       'abdominaux'),
  ('Relevé de jambes suspendu',     'abdominaux'),
  ('Crunch à la poulie',            'abdominaux'),

  ('Épaulé-jeté',                   'full_body'),
  ('Kettlebell swing',              'full_body')
on conflict (lower(name)) where created_by is null do update
  set muscle_group = excluded.muscle_group;
