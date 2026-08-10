/**
 * Renseigne les variables requises AVANT l'import d'`AppModule`.
 *
 * `ConfigModule.forRoot({ validate })` s'exécute à l'évaluation du décorateur
 * `@Module`, donc dès l'import : les définir dans un `beforeEach` serait trop
 * tard. Ces valeurs sont factices, aucun appel réseau n'est fait.
 */
process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
