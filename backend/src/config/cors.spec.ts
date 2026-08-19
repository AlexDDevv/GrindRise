import { buildCorsOptions } from './cors';

/** Rejoue ce que fait le middleware CORS : appeler `origin` et lire le verdict. */
function verdictFor(
  allowedOrigins: string[],
  requestOrigin: string | undefined,
): boolean {
  const { origin } = buildCorsOptions(allowedOrigins);

  if (typeof origin !== 'function') {
    throw new Error('La politique CORS doit décider origine par origine.');
  }

  let allowed: boolean | undefined;
  origin(requestOrigin, (error, value) => {
    if (error) throw error;
    allowed = value as boolean;
  });

  if (allowed === undefined) {
    throw new Error("La politique CORS n'a pas répondu.");
  }
  return allowed;
}

describe('buildCorsOptions', () => {
  it('autorise une origine de la liste blanche', () => {
    expect(
      verdictFor(['https://app.grindrise.fr'], 'https://app.grindrise.fr'),
    ).toBe(true);
  });

  it('refuse une origine absente de la liste', () => {
    expect(
      verdictFor(['https://app.grindrise.fr'], 'https://pirate.exemple.fr'),
    ).toBe(false);
  });

  it('refuse tout quand la liste est vide — jamais de joker implicite', () => {
    expect(verdictFor([], 'https://app.grindrise.fr')).toBe(false);
  });

  it('laisse passer une requête sans en-tête Origin — le cas du mobile natif', () => {
    expect(verdictFor([], undefined)).toBe(true);
  });

  it('distingue le schéma et le port, comme le fait un navigateur', () => {
    const liste = ['https://app.grindrise.fr'];

    expect(verdictFor(liste, 'http://app.grindrise.fr')).toBe(false);
    expect(verdictFor(liste, 'https://app.grindrise.fr:8443')).toBe(false);
  });
});
