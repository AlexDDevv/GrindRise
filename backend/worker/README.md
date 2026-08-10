# Worker de notifications (à venir)

Emplacement réservé — **rien n'est implémenté ici pour l'instant**, et ce dossier
n'est pas compilé par l'API (`tsconfig.build.json` ne couvre que `src/`).

## Ce que ce sera

Un **process Node séparé** de l'API, packagé dans sa propre image et déployé
comme une seconde app CapRover. Il ne sert aucune requête HTTP : il consomme une
queue **BullMQ** (adossée à Redis, déployé en one-click CapRover) et envoie les
notifications.

```
API NestJS  ──push job──>  Redis / BullMQ  ──consume──>  worker
                                                            ├──> Resend (email)
                                                            └──> Expo Push (notif)
```

## Pourquoi séparé du monolithe

C'est la seule exception à l'architecture modular monolith retenue :

- l'envoi est lent, faillible et doit pouvoir être retenté sans bloquer une
  requête utilisateur ;
- le worker se met à l'échelle indépendamment de l'API (pics de notifications
  groupées : rappels de streak, fin de saison…) ;
- un crash d'envoi ne doit jamais faire tomber l'API.

## Ce qu'il restera à faire le moment venu

1. Déployer Redis en one-click sur CapRover, exposer son URL aux deux apps.
2. Côté API : un `NotificationsModule` qui ne fait que *produire* des jobs
   (`bullmq` `Queue.add`), jamais d'envoi synchrone.
3. Ici : un `package.json` propre, un `Worker` BullMQ par type de job, les
   clients Resend et Expo Push, et une politique de retry/backoff explicite.
4. Un `Dockerfile` calqué sur celui de l'API, avec `CMD ["node", "dist/main"]`
   pointant sur le worker.

Tant que ces étapes ne sont pas faites, les rappels et notifications n'existent
pas dans l'app.
