import {
  draftFrom,
  emptyDraft,
  parseDraft,
  repeatOf,
  step,
  switchType,
  type SetDraftInput,
} from './setDraft';
import type { SetDraft } from './types';

const saisie = (over: Partial<SetDraftInput> = {}): SetDraftInput => ({
  type: 'reps',
  count: '10',
  weight: '80',
  isBodyweight: false,
  ...over,
});

describe('parseDraft — répétitions', () => {
  it('lit un comptage et une charge', () => {
    expect(parseDraft(saisie())).toEqual({
      ok: true,
      set: { type: 'reps', reps: 10, weightKg: 80, isBodyweight: false },
    });
  });

  it('rend une charge vide en `null`, jamais en zéro', () => {
    // Un zéro serait une charge déclarée ; `null` deviendra un champ omis.
    expect(parseDraft(saisie({ weight: '  ' }))).toEqual({
      ok: true,
      set: { type: 'reps', reps: 10, weightKg: null, isBodyweight: false },
    });
  });

  it('range une charge saisie « 0 » avec le champ vide, jamais dans le corps envoyé', () => {
    // `toWorkoutPayload` n'omet que le nul : un zéro rendu tel quel partirait
    // comme une charge déclarée de zéro kilo, ce qui n'est pas la même chose
    // qu'une série sans lest.
    expect(parseDraft(saisie({ weight: '0' }))).toEqual({
      ok: true,
      set: { type: 'reps', reps: 10, weightKg: null, isBodyweight: false },
    });
    expect(parseDraft(saisie({ weight: '0,00' }))).toEqual({
      ok: true,
      set: { type: 'reps', reps: 10, weightKg: null, isBodyweight: false },
    });
  });

  it('accepte la virgule décimale du clavier français', () => {
    expect(parseDraft(saisie({ weight: '82,5' }))).toEqual({
      ok: true,
      set: { type: 'reps', reps: 10, weightKg: 82.5, isBodyweight: false },
    });
  });

  it('refuse une saisie à plusieurs virgules plutôt que d’en garder le début', () => {
    // `replace(',', '.')` n'en remplaçait que la première : « 1,2,5 » devenait
    // « 1.2,5 », refusé parce qu'une virgule y traînait encore et non parce
    // que la saisie avait été reconnue comme une charge impossible.
    expect(parseDraft(saisie({ weight: '1,2,5' })).ok).toBe(false);
    expect(parseDraft(saisie({ count: '1,0,0' })).ok).toBe(false);
  });

  it('arrondit la charge au centième, ce que `numeric(6, 2)` accepte', () => {
    const resultat = parseDraft(saisie({ weight: '80,456' }));

    expect(resultat).toEqual({
      ok: true,
      set: { type: 'reps', reps: 10, weightKg: 80.46, isBodyweight: false },
    });
  });

  it('refuse un comptage vide', () => {
    expect(parseDraft(saisie({ count: '' }))).toEqual({
      ok: false,
      message: 'Indique le nombre de répétitions.',
    });
  });

  it('refuse un comptage hors des bornes du DTO', () => {
    expect(parseDraft(saisie({ count: '0' })).ok).toBe(false);
    expect(parseDraft(saisie({ count: '1001' })).ok).toBe(false);
    expect(parseDraft(saisie({ count: '1000' })).ok).toBe(true);
  });

  it('refuse une charge hors bornes ou non numérique', () => {
    expect(parseDraft(saisie({ weight: '1001' })).ok).toBe(false);
    expect(parseDraft(saisie({ weight: '-1' })).ok).toBe(false);
    expect(parseDraft(saisie({ weight: 'lourd' })).ok).toBe(false);
  });

  it('porte le lest au poids du corps', () => {
    expect(parseDraft(saisie({ count: '6', weight: '10', isBodyweight: true }))).toEqual({
      ok: true,
      set: { type: 'reps', reps: 6, weightKg: 10, isBodyweight: true },
    });
  });

  it('accepte une série au poids du corps sans lest', () => {
    expect(parseDraft(saisie({ count: '8', weight: '', isBodyweight: true }))).toEqual({
      ok: true,
      set: { type: 'reps', reps: 8, weightKg: null, isBodyweight: true },
    });
  });
});

describe('parseDraft — temps', () => {
  it('lit une durée en secondes, sans champ de répétitions', () => {
    expect(parseDraft(saisie({ type: 'time', count: '45', weight: '' }))).toEqual({
      ok: true,
      set: { type: 'time', durationSeconds: 45, weightKg: null, isBodyweight: false },
    });
  });

  it('refuse une durée hors des bornes du DTO', () => {
    expect(parseDraft(saisie({ type: 'time', count: '0' })).ok).toBe(false);
    expect(parseDraft(saisie({ type: 'time', count: '36001' })).ok).toBe(false);
    expect(parseDraft(saisie({ type: 'time', count: '36000' })).ok).toBe(true);
  });

  it('garde une charge facultative en temps', () => {
    expect(parseDraft(saisie({ type: 'time', count: '60', weight: '20' }))).toEqual({
      ok: true,
      set: { type: 'time', durationSeconds: 60, weightKg: 20, isBodyweight: false },
    });
  });
});

describe('switchType', () => {
  it('vide le comptage : 10 répétitions ne font pas 10 secondes', () => {
    expect(switchType(saisie(), 'time')).toEqual(
      saisie({ type: 'time', count: '' }),
    );
  });

  it('conserve la charge et le poids du corps', () => {
    const bascule = switchType(saisie({ weight: '20', isBodyweight: true }), 'time');

    expect(bascule.weight).toBe('20');
    expect(bascule.isBodyweight).toBe(true);
  });

  it('ne change rien quand le type est déjà celui demandé', () => {
    expect(switchType(saisie(), 'reps')).toEqual(saisie());
  });
});

describe('step', () => {
  it('incrémente et décrémente les répétitions', () => {
    expect(step(saisie(), 1).count).toBe('11');
    expect(step(saisie(), -1).count).toBe('9');
  });

  it('ne descend pas sous 1, la borne du DTO', () => {
    expect(step(saisie({ count: '1' }), -1).count).toBe('1');
  });

  it('part de 1 quand le champ est vide', () => {
    expect(step(saisie({ count: '' }), 1).count).toBe('1');
  });

  it("ne s'applique pas en mode temps", () => {
    // Les raccourcis d'une série au temps sont des durées entières, pas ±1 s.
    const temps = saisie({ type: 'time', count: '45' });

    expect(step(temps, 1)).toEqual(temps);
  });
});

describe('draftFrom et repeatOf', () => {
  const precedente: SetDraft = {
    type: 'reps',
    reps: 8,
    weightKg: 90,
    isBodyweight: false,
  };

  it('rouvre une série existante en saisie', () => {
    expect(draftFrom(precedente)).toEqual(saisie({ count: '8', weight: '90' }));
  });

  it("reprend la précédente à l'identique", () => {
    expect(repeatOf(precedente)).toEqual(draftFrom(precedente));
  });

  it('rend une charge nulle en champ vide, et non en null', () => {
    expect(draftFrom({ ...precedente, weightKg: null }).weight).toBe('');
  });

  it('rouvre une série au temps', () => {
    expect(
      draftFrom({ type: 'time', durationSeconds: 45, weightKg: null, isBodyweight: true }),
    ).toEqual({ type: 'time', count: '45', weight: '', isBodyweight: true });
  });
});

describe('emptyDraft', () => {
  it('ouvre en répétitions par défaut, tout vide', () => {
    expect(emptyDraft()).toEqual({
      type: 'reps',
      count: '',
      weight: '',
      isBodyweight: false,
    });
  });
});
