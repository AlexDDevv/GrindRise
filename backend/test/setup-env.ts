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
