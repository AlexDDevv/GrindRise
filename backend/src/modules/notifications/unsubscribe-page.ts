/**
 * Issue d'une demande de désabonnement.
 *
 * `desabonne` couvre aussi le second clic sur le même lien : la bascule est
 * idempotente, et afficher une erreur à quelqu'un qui redemande ce qu'il a
 * déjà obtenu serait absurde.
 */
export type UnsubscribeOutcome = 'desabonne' | 'lien-invalide' | 'indisponible';

const TITRES: Record<UnsubscribeOutcome, string> = {
  desabonne: 'C’est fait',
  'lien-invalide': 'Ce lien ne fonctionne pas',
  indisponible: 'Réessaie dans un moment',
};

/**
 * Aucun de ces messages ne renvoie vers un écran de réglages : il n'en existe
 * pas encore côté mobile. Promettre une bascule introuvable serait pire que
 * de ne rien promettre — à compléter le jour où l'écran arrive.
 */
const MESSAGES: Record<UnsubscribeOutcome, string> = {
  desabonne:
    'Tu ne recevras plus d’email quand tu franchis un palier. Les codes de ' +
    'connexion, eux, continuent d’arriver — sans eux, impossible de se ' +
    'connecter.',
  'lien-invalide':
    'Le lien est incomplet ou a été modifié en chemin. Rouvre l’email d’origine ' +
    'et clique le lien plutôt que de le recopier à la main.',
  indisponible:
    'Le désabonnement est momentanément impossible et ta demande n’a pas été ' +
    'enregistrée. Réessaie dans quelques minutes, depuis le même lien.',
};

/**
 * Page de confirmation, servie telle quelle par l'endpoint.
 *
 * Tout est en dur dans un seul fichier, sans moteur de gabarit ni feuille de
 * style externe : c'est la seule page HTML que cette API sert, et elle doit
 * s'afficher dans le navigateur intégré d'un client mail, où une requête
 * supplémentaire vers un asset a toutes les chances d'être bloquée.
 *
 * Aucune donnée de l'utilisateur n'y est interpolée — ni email, ni pseudo, ni
 * identifiant. Il n'y a donc rien à échapper, et rien à divulguer à qui
 * fabriquerait une URL au hasard.
 */
export function renderUnsubscribePage(outcome: UnsubscribeOutcome): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${TITRES[outcome]} — Grindrise</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    box-sizing: border-box;
    font-family: Georgia, "Times New Roman", serif;
    background: #f6f2ec;
    color: #2b2019;
  }
  main { max-width: 34rem; }
  h1 { font-size: 1.5rem; margin: 0 0 1rem; }
  p { font-size: 1rem; line-height: 1.6; margin: 0 0 1rem; }
  .pied { color: #7a6a5a; font-size: 0.9rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #17120e; color: #ece3d8; }
    .pied { color: #9c8b78; }
  }
</style>
</head>
<body>
<main>
  <h1>${TITRES[outcome]}</h1>
  <p>${MESSAGES[outcome]}</p>
  <p class="pied">— Grindrise</p>
</main>
</body>
</html>
`;
}
