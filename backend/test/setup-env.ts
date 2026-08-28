/**
 * Renseigne les variables requises AVANT l'import d'`AppModule`.
 *
 * `ConfigModule.forRoot({ validate })` s'exécute à l'évaluation du décorateur
 * `@Module`, donc dès l'import : les définir dans un `beforeEach` serait trop
 * tard. Ces valeurs sont factices, aucun appel réseau n'est fait.
 */
process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

/**
 * Liste blanche CORS des tests de bout en bout. Deux origines pour que
 * `cors.e2e-spec.ts` puisse prouver qu'une troisième est bien refusée.
 */
process.env.CORS_ALLOWED_ORIGINS ??=
  'https://app.grindrise.fr,http://localhost:5173';

/**
 * De quoi signer et composer un lien de désabonnement. Requises dès que
 * `REDIS_URL` est posée ; ici elles servent à `unsubscribe.e2e-spec.ts`, qui
 * vérifie l'endpoint sans queue.
 */
process.env.UNSUBSCRIBE_TOKEN_SECRET ??=
  'secret-de-test-assez-long-pour-etre-credible';
process.env.PUBLIC_API_URL ??= 'https://api.exemple.test';

/**
 * Secret du webhook RevenueCat. Requis pour `auth.e2e-spec.ts`, qui doit
 * prouver la route joignable *avec* un secret configuré — le cas absent (501)
 * est déjà couvert unitairement sur le contrôleur.
 */
process.env.REVENUECAT_WEBHOOK_SECRET ??=
  'secret-de-test-du-webhook-revenuecat-assez-long';
