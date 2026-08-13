/**
 * Formatage des nombres affichés.
 *
 * Le français sépare les milliers par une espace insécable — 2 450, jamais
 * 2450 ni 2,450. Passer par `Intl` plutôt que par une regex maison garde le
 * bon caractère d'espacement, celui que `tabular-nums` alignera.
 */
export const formatNumber = (value: number): string => value.toLocaleString('fr-FR');

/**
 * Jour d'une séance, tel qu'on en parle.
 *
 * « Hier » plutôt que « 12 août » : sur les deux jours qui portent l'essentiel
 * de l'activité affichée, le nom relatif se lit sans calcul. Au-delà, la date
 * reprend la main — « il y a 9 jours » obligerait à compter pour se situer.
 *
 * Le découpage suit le fuseau de l'appareil, celui que `loadUserContext` a
 * aligné sur `profiles.timezone` : l'affichage tombe donc sur les mêmes jours
 * locaux que le streak calculé côté serveur.
 */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = dayDistance(date, now);

  if (days === 0) return 'Aujourd’hui';
  if (days === 1) return 'Hier';

  return date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}

/** Heure d'une séance. Le français écrit « 19 h 40 », pas « 19:40 ». */
export function formatTimeOfDay(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    .replace(':', ' h ');
}

/** Horodatage complet d'une séance : « Lundi 10 août · 19 h 40 ». */
export function formatDateTime(iso: string, now: Date = new Date()): string {
  return `${formatDayLabel(iso, now)} · ${formatTimeOfDay(iso)}`;
}

/**
 * Nombre de jours civils entre deux instants.
 *
 * La soustraction porte sur des dates ramenées à minuit local, et non sur des
 * millisecondes : un écart de 26 heures peut enjamber un seul minuit (séance
 * d'hier soir vue ce matin) comme deux, et le nombre de jours est ce qui
 * intéresse ici. Passer par les millisecondes se tromperait aussi sur les
 * journées de 23 ou 25 heures des changements d'heure.
 */
function dayDistance(from: Date, to: Date): number {
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000);
}
