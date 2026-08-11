import {
  addDays,
  daysBetween,
  localDayBounds,
  resolveTimeZone,
  toLocalDay,
} from './local-day';

/**
 * Le fuseau est ce qui décide à quel jour appartient une séance, donc ce qui
 * décide d'un streak. Une erreur ici ne se voit pas : elle décale simplement
 * les séances tardives d'un jour, et casse des chaînes au hasard.
 */
describe('jours locaux', () => {
  const PARIS = 'Europe/Paris';
  const AUCKLAND = 'Pacific/Auckland';

  describe('séance à cheval sur minuit', () => {
    it('range une séance de 23 h 55 dans le jour qui s’achève', () => {
      // 21 h 55 UTC = 23 h 55 à Paris en été.
      const instant = new Date('2026-08-10T21:55:00.000Z');
      expect(toLocalDay(instant, PARIS)).toBe('2026-08-10');
    });

    it('range une séance de 00 h 05 dans le jour qui commence', () => {
      const instant = new Date('2026-08-10T22:05:00.000Z');
      expect(toLocalDay(instant, PARIS)).toBe('2026-08-11');
    });

    it('n’est pas le même jour selon le fuseau', () => {
      // Le même instant : encore le 10 à Paris, déjà le 11 à Auckland.
      const instant = new Date('2026-08-10T21:55:00.000Z');
      expect(toLocalDay(instant, PARIS)).toBe('2026-08-10');
      expect(toLocalDay(instant, AUCKLAND)).toBe('2026-08-11');
    });

    it('ne se cale pas sur minuit UTC', () => {
      // 00 h 30 UTC le 11 août, c'est encore la soirée du 10 pour personne à
      // Paris : c'est 2 h 30 du matin. Un découpage UTC daterait cette séance
      // du 11 alors qu'elle prolonge la soirée du 10 — c'est exactement le
      // décalage que ce module existe pour éviter.
      const instant = new Date('2026-08-11T00:30:00.000Z');
      expect(toLocalDay(instant, PARIS)).toBe('2026-08-11');
      expect(toLocalDay(instant, 'UTC')).toBe('2026-08-11');

      const soiree = new Date('2026-08-10T23:30:00.000Z');
      expect(toLocalDay(soiree, PARIS)).toBe('2026-08-11');
      expect(toLocalDay(soiree, 'UTC')).toBe('2026-08-10');
    });
  });

  describe('bornes d’un jour local', () => {
    it('encadre un jour ordinaire sur 24 h', () => {
      const { start, end } = localDayBounds('2026-08-11', PARIS);

      expect(start.toISOString()).toBe('2026-08-10T22:00:00.000Z');
      expect(end.toISOString()).toBe('2026-08-11T22:00:00.000Z');
    });

    it('encadre les 23 h du passage à l’heure d’été', () => {
      // 29 mars 2026 : à 2 h locales il est soudain 3 h.
      const { start, end } = localDayBounds('2026-03-29', PARIS);

      expect(start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
      expect(end.toISOString()).toBe('2026-03-29T22:00:00.000Z');
      expect(end.getTime() - start.getTime()).toBe(23 * 3_600_000);
    });

    it('encadre les 25 h du retour à l’heure d’hiver', () => {
      const { start, end } = localDayBounds('2026-10-25', PARIS);

      expect(end.getTime() - start.getTime()).toBe(25 * 3_600_000);
    });

    it('contient bien l’instant dont le jour a été déduit', () => {
      const instant = new Date('2026-10-25T00:30:00.000Z');
      const { start, end } = localDayBounds(toLocalDay(instant, PARIS), PARIS);

      expect(instant.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(instant.getTime()).toBeLessThan(end.getTime());
    });
  });

  describe('arithmétique', () => {
    it('traverse un changement de mois', () => {
      expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
      expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    });

    it('traverse un 29 février', () => {
      expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
      expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    });

    it('compte négativement vers le passé', () => {
      expect(daysBetween('2026-08-11', '2026-08-04')).toBe(-7);
    });
  });

  describe('fuseau de repli', () => {
    it('retombe sur le défaut quand la valeur est absente ou farfelue', () => {
      expect(resolveTimeZone(null)).toBe('Europe/Paris');
      expect(resolveTimeZone('')).toBe('Europe/Paris');
      expect(resolveTimeZone('Mars/Olympus')).toBe('Europe/Paris');
    });

    it('respecte un fuseau valide', () => {
      expect(resolveTimeZone(AUCKLAND)).toBe(AUCKLAND);
    });
  });
});
