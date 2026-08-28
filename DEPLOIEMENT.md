# Déploiement — monorepo Grindrise

Tout ce qu'il faut savoir pour déployer ce dépôt : la base Supabase, l'API
NestJS, et le pointage du mobile. Écrit le 2026-08-19, après que chaque étape
ait été exécutée — rien ici n'est théorique.

**Ce qui est ailleurs.** Le worker d'emails vit dans un second dépôt,
[grindrise-notifications](https://github.com/AlexDDevv/grindrise-notifications),
dont le `DEPLOIEMENT.md` porte la plateforme partagée : le VPS et son
durcissement, l'installation de CapRover, le DNS, Redis, le compte Brevo. Ce
document-ci n'en reprend que le strict nécessaire.

Les renvois à `docs/…` pointent vers des documents de travail **non versionnés**
(`docs/` est gitignoré, par décision). Ils n'existent que sur la machine où le
travail a été fait ; tout ce qui est nécessaire au déploiement est ici.

---

## Les deux environnements

| | Production | Test |
|---|---|---|
| Projet Supabase | `nycilerxjfwlodpghidp` (eu-central-1) | `wcrpitdjtlqcqmxcrhix` (eu-west-1) |
| App CapRover | `api` | `api-test` |
| Project CapRover | aucun | `test` |
| API publiée | `https://api.apps.grindrise.fr` | `https://api-test.apps.grindrise.fr` |
| Redis | `srv-captain--redis` | `srv-captain--redis-test` |
| Worker | `notifications` | `notifications-test` |

Même VPS, même CapRover, même compte Brevo. Aucune base et aucune file
partagées : les deux Redis sont des instances distinctes, donc le nom de file
`notifications` peut être identique de part et d'autre sans qu'aucun job ne
traverse.

**À quoi sert l'environnement de test.** Enregistrer de vraies séances sans
conséquence. En production, une fausse séance crédite de l'XP réelle, consomme
une fenêtre anti-triche et débloque des passages narratifs, sans retour en
arrière. Toute la chaîne y a été prouvée le 2026-08-19, email de palier compris.

## La plateforme, en bref

| | |
|---|---|
| VPS | OVH, `92.222.80.54` (IPv6 `2001:41d0:404:200::8e56`) |
| CapRover | 1.15.2, `https://captain.apps.grindrise.fr` |
| Domaine racine | `apps.grindrise.fr` |
| Accès serveur | `ssh grindrise` |

Le CLI CapRover s'installe et s'authentifie une fois :

```bash
pnpm add -g caprover
caprover login          # URL : captain.apps.grindrise.fr
caprover list           # doit afficher la machine « grindrise »
```

Le reste — durcissement, pare-feu, DNS, certificats — est dans le
`DEPLOIEMENT.md` du dépôt notifications.

---

## Supabase

### Appliquer les migrations

La CLI ne parle qu'au **projet lié**, et `supabase db reset` *drop* sa base.
`db push` n'accepte pas `--project-ref` (seulement `--linked`, `--local`,
`--db-url`), donc migrer le test impose de relier, pousser, puis **relier la
production dans le même geste** — sans quoi le prochain `pnpm db:push` de
n'importe qui partira sur le mauvais projet :

```bash
pnpm exec supabase link --project-ref wcrpitdjtlqcqmxcrhix   # test
pnpm db:push
pnpm db:types
pnpm exec supabase link --project-ref nycilerxjfwlodpghidp   # production
```

`pnpm db:types` se glisse **avant** le relien de la production, jamais après :
il lit `--linked`, comme `db push`, donc lancé après le relien de la
production il générerait les types depuis un schéma qui n'a pas encore les
nouvelles tables.

Passer par `pnpm exec supabase` et non par le script `pnpm db` : pnpm intercepte
les options longues et peut ne pas transmettre `--project-ref`.

Vérifier ensuite que `supabase/.temp/project-ref` porte bien la référence
attendue. Ce fichier est gitignoré et disparaît au moindre nettoyage ; sans lui,
la CLI répond « Cannot find project ref » — un échec franc, préférable à une
poussée sur le mauvais projet.

**Ne jamais lancer `pnpm db:reset`.**

Rien à charger à part : les données de référence vivent dans la migration
`20260810150500_reference_data.sql`, il n'y a pas de `seed.sql`.

**Avertissement — fenêtre de casse entre migration et déploiement.** La
migration `20260820100100_strength_rpc.sql` supprime la signature à douze
arguments de `log_workout_with_xp` avant de créer celle à quatorze, et les
deux nouveaux paramètres n'ont pas de valeur par défaut. Entre l'application
des migrations et la mise en ligne du nouveau backend, l'API en place appelle
encore la fonction avec douze arguments nommés : plus aucun candidat,
PostgREST répond `PGRST202`, et **l'enregistrement de séance tombe en 500
pour TOUS les sports**, pas seulement la musculation. Décision assumée, l'app
n'étant pas distribuée : on prend cette fenêtre plutôt que de la subir, donc
on migre **puis on déploie l'API immédiatement**, jamais l'inverse, et on ne
laisse jamais traîner un état intermédiaire.

Contrôler l'état sans la CLI, avec le token de `~/.supabase/access-token` :

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  "https://api.supabase.com/v1/projects/<ref>/database/query" \
  -d '{"query":"select version from supabase_migrations.schema_migrations order by 1"}'
```

### Configuration auth : rien n'est hérité

Chaque projet Supabase porte sa propre configuration auth. Un projet neuf arrive
avec les trois verrous email intacts, plus un quatrième piège. Tout se pose par
le Management API — `GET`/`PATCH` sur
`https://api.supabase.com/v1/projects/<ref>/config/auth` — ce qui évite la
navigation et rend chaque réglage relisible.

| À poser | Valeur | Défaut d'un projet neuf |
|---|---|---|
| SMTP | `smtp-relay.brevo.com:587`, identifiant en `…@smtp-brevo.com` | aucun (provider intégré) |
| Expéditeur | `bonjour@grindrise.fr`, nom `Grindrise` | — |
| Gabarits *Confirm signup* et *Magic Link* | `{{ .Token }}`, **sans** `{{ .ConfirmationURL }}` | l'inverse |
| Sujet des deux | `{{ .Token }} est ton code de connexion Grindrise` | générique |
| `mailer_otp_length` | **6** | **8** |
| `rate_limit_email_sent` | 30 | 2 |

**L'ordre compte** : le `PATCH` des gabarits échoue en `HTTP 400` (« Email
template modification is not available for free tier projects using the default
email provider ») tant que le SMTP custom n'est pas branché. Ce n'est pas une
panne.

Quatre pièges qui coûtent du temps si on les découvre en route :

- **`smtp_pass` est renvoyé haché par le Management API.** La valeur lue en `GET`
  n'est pas la clé Brevo : un `PATCH` qui la recopie stocke le hachage comme mot
  de passe, et l'authentification SMTP échoue d'une façon qui ressemble à une clé
  erronée. **Le SMTP ne se recopie donc pas d'un projet à l'autre.** Brevo ne
  réaffiche pas toujours la clé non plus : le 2026-08-19 il a fallu la régénérer.
  En cas de rotation, **créer la nouvelle clé avant de supprimer l'ancienne** —
  Brevo en accepte plusieurs, et entre la suppression et le collage sur la
  production plus aucun email de connexion ne part, donc plus personne n'entre
  dans l'app.
- **Brevo expose deux canaux** sous deux onglets voisins : la clé **API**, dont
  le worker se sert pour parler à `api.brevo.com`, et la clé **SMTP**, dont
  Supabase Auth se sert. Passer l'une pour l'autre échoue à l'authentification
  d'une façon qui ressemble à un mot de passe erroné. La rotation de la clé SMTP
  ne touche donc pas les emails de palier.
- **`mailer_otp_length` vaut 8 par défaut** alors que le mobile impose
  `OTP_LENGTH = 6` et refuse toute autre longueur *avant même l'appel réseau*.
  Verrou muet et indépendant du SMTP : le code arriverait par email et se ferait
  rejeter par l'écran de saisie.
- **Les deux gabarits comptent.** *Confirm signup* part à la première demande
  d'un compte inexistant, *Magic Link* à toutes les suivantes ; le basculement se
  fait sur `email_confirmed_at`. N'en corriger qu'un donne un parcours qui marche
  une fois sur deux, ce qui se lit comme un bug de code.

L'expéditeur est **la même adresse sur les deux environnements**. Séparer les
statistiques d'envoi n'apporterait rien, l'adresse est validée côté Brevo et
`grindrise.fr` est authentifié (DKIM + DMARC).

### Les gabarits sont versionnés, mais ne se déploient pas seuls

`supabase/templates/confirmation.html` et `magic_link.html` portent le contenu
des deux emails, câblés dans `config.toml`. Ils existent pour donner un
historique git et une relecture au texte que voit un joueur — pas pour être
poussés.

**`supabase config push` est délibérément écarté.** Il accepte `--project-ref`
mais n'a **aucune granularité** : il enverrait tout `config.toml`, dont un bloc
`[auth]` écrit pour la pile locale (`site_url` en 127.0.0.1, `email_sent = 2`,
`max_frequency = "1s"`, `enable_confirmations = false`), et écraserait la
configuration du projet visé. Tant que ce bloc n'a pas été rendu valable pour un
projet hébergé, les gabarits se recopient à la main dans le dashboard — quatre
collages, deux gabarits sur deux projets. Un commentaire le rappelle sur place
dans `config.toml`.

La pile locale (`supabase start`), elle, les utilise directement.

### `narrative_beats` est vide

En production comme en test : les migrations ne l'alimentent pas, la table attend
du contenu de game design (voir `docs/grindrise-plan-narratif.md`). Sans au moins
un passage, le déblocage narratif fonctionne mais n'a rien à ouvrir. Le projet de
test en porte un, posé pour exercer le maillon.

Rappel des contraintes : un beat `main` se déclenche au niveau global, un beat
`sport:<id>` au nombre de séances du sport, et les croiser est refusé par
`narrative_beats_track_trigger_coherent`.

---

## L'API sur CapRover

### Déployer

```bash
cd ~/GrindRise
caprover deploy -n grindrise -a api -b main          # production
caprover deploy -n grindrise -a api-test -b main     # test
```

Depuis la **racine** du monorepo, qui est une racine git — c'est ce qui permet
`-b`. Le CLI affiche *« No captain-definition was found in main directory »* :
avertissement attendu, il précise lui-même « unless you have specified a special
path ».

Ce qui rend cela possible : le champ **`captainDefinitionRelativeFilePath`** des
deux apps vaut `./backend/captain-definition`. Le contexte Docker est alors
`backend/`, pas la racine — ce qui est correct, `backend/` ayant son propre
`pnpm-lock.yaml`.

Où se trouve ce champ, parce qu'il n'est pas là où on le cherche : app → onglet
**Déploiement** (pas *Configurations de l'App*), **tout en bas**, sous *« Method
6: Deploy via ImageName »*. Champ préfixé « chemin de captain-definition » et
**grisé** ; cliquer **« Éditer »** pour le déverrouiller, puis **« Enregistrer &
Redémarrer »** — ce bouton **recrée le container**, prévoir quelques secondes
d'interruption.

**Pourquoi pas une archive du sous-arbre.** `git archive main:backend` +
`caprover deploy -t` fonctionne, mais laisse le `gitHash` **vide** côté CapRover :
impossible de savoir après coup quel code tourne. Avec `-b`, le CLI journalise
*« Using last commit on "main": … »* et CapRover garde l'empreinte. Cette méthode
échoue désormais de toute façon, `./backend/captain-definition` n'existant pas à
la racine d'une telle archive — échec bruyant voulu.

> **Piège du CLI : il mémorise la source, pas la branche.**
> `~/.config/configstore/caprover.json` (`DeployedDirs`) garde par répertoire
> courant ce qu'on lui a donné la dernière fois, et c'est ce que rejoue
> `caprover deploy -d`. Une entrée pointant une archive dans `/tmp` a déjà
> survécu à la session qui l'avait produite : `-d` y serait reparti **sans lire
> le dépôt**. Toujours passer `-b <branche>` explicitement — une branche ne peut
> pas être périmée, un fichier sur disque oui.

### Le CLI exige un terminal, et plus d'un « oui »

`caprover deploy` pose ses questions avec `inquirer` 6, qui referme son
`readline` dès que l'entrée n'est pas un terminal. Rediriger l'entrée — `<
/dev/null` comme `printf 'y\n' |` — ne répond donc pas à la question : le
processus meurt sur `ERR_USE_AFTER_CLOSE: readline was closed`, avant tout envoi.
Il faut lui allouer un pseudo-terminal :

```bash
printf 'y\ny\ny\ny\n' | script -qec "caprover deploy -n grindrise -a api -b main" /dev/null
```

**Le nombre de `y` n'est pas le même partout.** Depuis `grindrise-notifications`
une seule confirmation suffit ; depuis ce monorepo le CLI en réclame davantage,
l'avertissement *« No captain-definition was found in main directory »* comptant
pour une question de plus. En fournir trop est sans effet — les lignes en trop
sont ignorées — en fournir trop peu fait échouer le déploiement.

Cet échec-là est sans danger : il survient **avant** l'envoi de l'archive, donc
l'application en place continue de servir. Le vérifier plutôt que le supposer,
avec un `curl` sur `/health` entre deux tentatives.

### Variables d'environnement

À saisir dans le dashboard CapRover, **jamais dans le dépôt**. La liste fait foi
depuis `backend/src/config/env.config.ts`, pas depuis `.env.example` qui en
déclare davantage.

Requises — l'API **refuse de démarrer** si l'une manque, c'est voulu : un
container mal configuré doit échouer au boot, pas au premier appel base. Un
container qui ne monte pas est donc un diagnostic, pas une énigme.

| Variable | Note |
|---|---|
| `SUPABASE_URL` | URL nue du projet, sans `/rest/v1` ni suffixe de chemin |
| `SUPABASE_SERVICE_ROLE_KEY` | contourne la RLS, à traiter comme un mot de passe root |

Optionnelles :

| Variable | Défaut | Rôle |
|---|---|---|
| `REDIS_URL` | aucune | **à ajouter en dernier.** Absente, l'API ne produit aucun job et le signale au démarrage |
| `NOTIFICATIONS_QUEUE_NAME` | `notifications` | doit correspondre à celui du worker |
| `PORT` | `3000` | inutile de la déclarer |
| `REVENUECAT_WEBHOOK_SECRET` | aucune | requis pour que le webhook réponde autre chose que 501 |
| `CORS_ALLOWED_ORIGINS` | aucune | origines web autorisées, séparées par des virgules. Sans objet pour le mobile |
| `UNSUBSCRIBE_TOKEN_SECRET` | aucune | **requise dès que `REDIS_URL` l'est.** 32 caractères minimum |
| `PUBLIC_API_URL` | aucune | **requise dès que `REDIS_URL` l'est.** URL publique de l'API, sans barre finale |

`REDIS_URL` est volontairement optionnelle, contrairement à la règle du crash au
boot : l'imposer rendrait Redis obligatoire pour tout développement local.

Les deux dernières sont optionnelles **par ricochet** : sans queue, aucun email
de palier ne part, il n'y a donc aucun lien de désabonnement à signer. Dès que
`REDIS_URL` est renseignée, elles deviennent requises et leur absence fait
échouer le boot — voir *Désabonnement des emails de palier* ci-dessous.

#### Ouvrir l'API à un navigateur

CORS est actif, avec une liste blanche vide par défaut : **aucune origine web
n'est autorisée** tant qu'on n'en nomme pas une. Le mobile natif n'est pas
concerné — il n'envoie pas d'en-tête `Origin`, CORS ne s'applique donc pas à
lui, et une liste vide ne lui change rien.

Le jour où un dashboard web ou un back-office apparaît, il s'ajoute **sans
toucher au code ni redéployer** : dans CapRover, *Configurations de l'App* →
`CORS_ALLOWED_ORIGINS` → **Enregistrer & Redémarrer**. Le container repart avec
la nouvelle liste ; l'image ne bouge pas.

```
CORS_ALLOWED_ORIGINS=https://app.grindrise.fr,https://admin.grindrise.fr
```

Trois pièges, tous transformés en refus au démarrage plutôt qu'en énigme de
console de navigateur :

- **barre finale ou chemin** (`https://app.grindrise.fr/`) : l'en-tête `Origin`
  d'un navigateur n'en porte jamais, la valeur ne correspondrait à rien ;
- **`*`** : refusé. Toutes les routes de l'API sont authentifiées par
  `Authorization: Bearer` ; un joker permettrait à n'importe quelle page web de
  les appeler avec le jeton d'une victime ;
- **schéma et port comptent** : `http://` ≠ `https://`, et `:5173` ≠ le défaut.

Un refus CORS n'est pas un refus d'accès : l'API répond normalement, sans
l'en-tête `Access-Control-Allow-Origin`, et c'est le navigateur qui empêche la
page appelante de lire la réponse. Inutile de chercher un 403 dans les logs.

Un détail qui trompe : le **préflet** d'une origine refusée finit en **404**, pas
en 204. Le middleware `cors` passe la main au routeur dès qu'il refuse, et
aucune route n'écoute `OPTIONS`. Ce n'est pas une route disparue, et le blocage
navigateur est le même — seule compte l'absence d'en-tête.

```bash
# Origine refusée : pas d'en-tête d'autorisation, et l'appel sans Origin passe.
curl -si -X OPTIONS -H 'Origin: https://inconnue.exemple.fr' \
  -H 'Access-Control-Request-Method: GET' https://api.apps.grindrise.fr/health | head -3
curl -s -o /dev/null -w '%{http_code}\n' https://api.apps.grindrise.fr/health   # 200
```

#### Désabonnement des emails de palier

L'email de palier n'est pas strictement transactionnel : il célèbre une
progression, il ne répond à aucune demande. La réglementation (CAN-SPAM,
RGPD/ePrivacy) impose donc d'y joindre un moyen de refus. Le code de connexion
OTP, lui, reste transactionnel — il n'est pas concerné, et ne doit surtout pas
devenir refusable.

Deux variables portent ce mécanisme, et l'API **refuse de démarrer** sans elles
dès que `REDIS_URL` est posée. Ce n'est pas un excès de zèle : sans elles, le
producteur n'empilerait plus aucun job, et la panne se lirait comme « les emails
de palier ne partent plus », sans cause visible.

```bash
# Générer le secret de signature — une fois, à conserver.
openssl rand -base64 48
```

| Variable | Note |
|---|---|
| `UNSUBSCRIBE_TOKEN_SECRET` | 32 caractères minimum. **La changer invalide tous les liens déjà envoyés** : les emails restent dans les boîtes des années, ce secret ne se fait pas tourner |
| `PUBLIC_API_URL` | `https://api.apps.grindrise.fr` — sans barre finale. Derrière le proxy CapRover, l'API ne voit que son port interne, elle ne peut pas la deviner |

Comment ça marche, en trois points :

1. l'API compose un lien signé (HMAC-SHA256 du `profile_id`) et le joint au job
   déposé dans la queue. Le worker ne signe rien : il recopie l'URL en pied de
   message et la reprend dans les en-têtes `List-Unsubscribe` et
   `List-Unsubscribe-Post` (RFC 2369 et 8058), d'où le bouton « Se désabonner »
   que le client mail affiche de lui-même ;
2. le clic atteint `GET /notifications/unsubscribe?token=…` — route publique,
   protégée par la signature du jeton et non par un JWT : se désabonner ne doit
   pas exiger de se connecter. Le bouton du client mail, lui, `POST`e sur la
   même URL, comme l'exige le désabonnement en un clic ;
3. l'API bascule `profiles.notify_level_up` à faux et sert une page de
   confirmation.

La RLS autorise déjà le propriétaire à réécrire la colonne (`profiles_update_own`),
donc un écran de réglages mobile pourra la rebasculer sans passer par l'API.
**Cet écran n'existe pas encore** : un joueur désabonné ne peut pas se
réabonner tout seul aujourd'hui, et la page de confirmation se garde bien de
lui promettre le contraire.

Le refus est vérifié **avant la mise en file**, jamais côté worker : un job
empilé finit toujours par être traité, ne serait-ce que par un rejeu manuel
depuis le tableau de bord BullMQ.

Vérifier après déploiement, sans envoyer d'email :

```bash
API=https://api.apps.grindrise.fr/notifications/unsubscribe

# 400 + une page HTML lisible : la route est publique et le jeton est vérifié.
curl -si "$API?token=peu-importe" | head -3

# Idem en POST : c'est le chemin du bouton « Se désabonner » du client mail.
curl -si -X POST "$API?token=peu-importe" | head -3
```

Un `401` sur l'une des deux signifierait que le décorateur `@Public()` a sauté,
et que tous les liens déjà partis sont morts. Un `404` sur le `POST` seul
donnerait un bouton de désabonnement qui échoue en silence — le pire cas, parce
que l'en-tête continue de le promettre.

Deux réglages hors variables, dans *Configurations de l'App* :

| Réglage | Valeur |
|---|---|
| Container HTTP Port | **`3000`** — le défaut de CapRover est 80, d'où une 502 sans explication |
| HTTP Settings | HTTPS activé + **Force HTTPS**, sinon l'en-tête `Authorization: Bearer` circule en clair |

**L'ordre du premier déploiement compte.** Le worker doit consommer la file avant
que l'API n'y dépose quoi que ce soit : un consommateur en avance sait traiter
l'ancien format, un producteur en avance empile des jobs que personne ne sait
lire. L'API se déploie pourtant en premier — sans `REDIS_URL` elle ne produit
rien. C'est l'ajout de cette variable, en dernier, qui ouvre le robinet.

**Et à chaque évolution du contrat, même règle.** Le champ `unsubscribeUrl` en
est une : le worker doit partir avant l'API, sinon les jobs empilés portent un
champ qu'il ne sait pas lire. Il est déclaré facultatif précisément pour que le
worker neuf sache aussi traiter les jobs de l'API d'avant, restés dans la file
pendant la bascule.

### Vérifier après déploiement

```bash
curl -s https://api.apps.grindrise.fr/health          # {"status":"ok"}
```

Puis, dans les logs de l'app, `Nest application successfully started` **sans**
avertissement sur `REDIS_URL`. Le `gitHash` de la version déployée doit
correspondre au commit poussé.

---

## Le mobile

### Les trois variables vont ensemble

Le mobile **s'authentifie directement contre Supabase**, sans passer par l'API.
Changer `EXPO_PUBLIC_API_URL` seul donnerait un jeton signé par la production,
qu'`api-test` rejetterait en le vérifiant contre le JWKS de son propre projet :
l'app semblerait connectée et **échouerait sur chaque appel authentifié**. Mode
de panne particulièrement trompeur, vérifié en réel — le même jeton donne `200`
sur `api-test` et `401` sur l'API de production.

Donc toujours les trois d'un bloc : `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`.

Contrôle rapide de cohérence : le `ref` encodé dans le JWT de la clé anon doit
être celui de l'URL.

### `mobile/.env`

Le fichier porte les deux blocs — un actif, l'autre en commentaire — et se
permute d'un geste. Les `EXPO_PUBLIC_*` sont inlinées **au build** : après
modification, `expo start -c` est **obligatoire**, sinon Metro resert l'ancien
bundle et le changement paraît sans effet.

`EXPO_PUBLIC_API_URL` ne peut pas être `localhost` quand l'app tourne sur un
appareil ou un émulateur — voir `docs/emulateur-android-wsl.md` pour le relais
IPv4 nécessaire sous WSL.

### EAS

`eas.json` porte trois profils (`development`, `preview`, `production`), mais le
projet **n'est pas lié à un compte EAS** et aucun profil ne porte les deux
variables Supabase — voir `docs/builds-eas.md`. Aucun build n'a encore eu lieu.

**Pas de profil `test`**, décidé le 2026-08-19 : le premier build EAS n'ayant pas
eu lieu, un profil serait de l'échafaudage non exercé, et cela évite de committer
la clé anon. Les essais contre l'environnement de test passent par `mobile/.env`.

---

## Précautions

- **Ne jamais lancer `pnpm db:reset`** : la commande *drop* la base du projet
  lié.
- **Ne pas lancer `supabase config push`** en l'état — voir plus haut.
- **Ne jamais modifier `backend/src/modules/notifications/contract.ts` seul.** Ce
  fichier est identique octet pour octet à `src/queue/contract.ts` du dépôt
  notifications, et rien ne l'impose techniquement : le vérificateur
  `pnpm run check:contract` n'existe que dans l'autre dépôt et se lance à la
  main. Une divergence casse la chaîne **sans erreur visible** — le producteur
  empile des jobs que le consommateur ne sait pas lire. Toute modification se
  porte dans les deux, et le worker se déploie **avant** l'API.
- **Ne pas commiter de secret.** Clé `service_role`, clé SMTP et clé API Brevo se
  saisissent dans les dashboards CapRover ou Supabase. Seule la clé `anon` a sa
  place côté mobile, protégée par la RLS.
- **Le quota Brevo de 300 emails/jour est commun** aux deux environnements et aux
  deux usages, authentification et paliers. Ne pas tester en boucle, et n'envoyer
  qu'à des adresses réelles — un rebond dégrade la réputation d'expédition du
  domaine. `smtp_max_frequency` impose en plus 60 s entre deux demandes de code
  pour un même utilisateur.
- **Un projet Supabase gratuit est mis en pause après 7 jours sans activité** et
  doit être réveillé à la main. Le vérifier avant de diagnostiquer une panne.

## Deux astuces de diagnostic

- **Le journal d'événements Brevo expose le sujet de l'email**, donc le code OTP
  lui-même, puisqu'il figure dans le sujet :
  `GET https://api.brevo.com/v3/smtp/statistics/events?email=…`. C'est la façon
  la plus rapide de prouver un parcours de connexion sans accès à la boîte de
  réception, et de distinguer `requests` (accepté) de `delivered` (arrivé).
- **`POST /auth/v1/admin/generate_link` rend l'OTP sans envoyer d'email.** De
  quoi ouvrir une session pour exercer l'API sans consommer le quota Brevo.

## Ce qui reste

- **Aucune intégration continue.** L'invariant des deux `contract.ts` identiques
  ne tient que sur un script lancé à la main, dans l'autre dépôt.
- **Le premier build EAS**, et les deux variables Supabase à porter dans les
  profils.
- **Rendre le bloc `[auth]` de `config.toml` valable pour un projet hébergé**, ce
  qui rendrait les gabarits déployables d'une commande par projet.
