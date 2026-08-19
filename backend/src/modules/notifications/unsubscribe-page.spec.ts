import { renderUnsubscribePage } from './unsubscribe-page';

describe('renderUnsubscribePage', () => {
  it('confirme le désabonnement sans laisser croire que les codes de connexion s’arrêtent', () => {
    // La confusion est le principal risque de cette page : quelqu'un qui croit
    // avoir coupé ses emails de connexion ne se reconnectera jamais.
    const page = renderUnsubscribePage('desabonne');

    expect(page).toContain('C’est fait');
    expect(page).toContain('codes de connexion');
  });

  it('annonce un lien invalide sans révéler pourquoi', () => {
    const page = renderUnsubscribePage('lien-invalide');

    expect(page).toContain('Ce lien ne fonctionne pas');
    // Rien sur la signature, le secret ou le profil visé : la page est servie
    // à qui fabrique une URL au hasard aussi bien qu'à un vrai destinataire.
    expect(page).not.toMatch(/signature|secret|profil/i);
  });

  it('invite à réessayer quand le service est indisponible', () => {
    const page = renderUnsubscribePage('indisponible');

    expect(page).toContain('Réessaie');
    expect(page).toContain('n’a pas été');
  });

  it('tient dans une page autonome, sans requête vers l’extérieur', () => {
    // Elle s'affiche dans le navigateur intégré d'un client mail, où une
    // requête vers un asset externe a toutes les chances d'être bloquée.
    const page = renderUnsubscribePage('desabonne');

    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect(page).not.toMatch(/<(script|img|link)\b/i);
    expect(page).toContain('<meta name="robots" content="noindex">');
  });
});
