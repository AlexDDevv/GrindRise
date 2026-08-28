import { isAuthorized, readEvent, transitionFor } from './contract';

const CORPS = {
  api_version: '1.0',
  event: {
    type: 'INITIAL_PURCHASE',
    app_user_id: '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16',
    event_timestamp_ms: 1_756_000_000_000,
    expiration_at_ms: 1_758_000_000_000,
  },
};

describe('readEvent', () => {
  it('lit l’événement imbriqué sous « event »', () => {
    // RevenueCat poste { api_version, event: { … } } : lire le corps à plat
    // rendrait tous les champs indéfinis sans qu'aucun test ne le voie.
    const event = readEvent(CORPS);

    expect(event).toEqual({
      type: 'INITIAL_PURCHASE',
      appUserId: '3f8b1c2e-6d4a-4f1b-9c7e-2a5d8e0b4f16',
      eventAt: new Date(1_756_000_000_000),
      expiresAt: new Date(1_758_000_000_000),
    });
  });

  it('accepte une échéance absente — c’est le cas du lifetime', () => {
    const event = readEvent({ event: { ...CORPS.event, expiration_at_ms: null } });

    expect(event?.expiresAt).toBeNull();
  });

  it('rend null sur un corps qui n’est pas un événement', () => {
    expect(readEvent(null)).toBeNull();
    expect(readEvent({})).toBeNull();
    expect(readEvent({ event: {} })).toBeNull();
    expect(readEvent({ event: { type: 'RENEWAL' } })).toBeNull();
  });

  it('rend null si l’horodatage n’est pas un nombre', () => {
    // Un NaN produirait une Date invalide, donc une comparaison toujours
    // fausse : le rejeu périmé ne serait plus détecté.
    expect(readEvent({ event: { ...CORPS.event, event_timestamp_ms: 'hier' } })).toBeNull();
  });

  it('rend null si l’App User ID n’est pas un UUID', () => {
    // RevenueCat envoie `$RCAnonymousID:…` pour un achat conclu avant que le
    // SDK ait reçu une identité. Laisser passer cette valeur ferait lever
    // Postgres en 22P02 sur la colonne `uuid`, donc répondre 5xx, donc rejouer
    // sans fin un événement que rien ne réparera.
    expect(
      readEvent({
        event: { ...CORPS.event, app_user_id: '$RCAnonymousID:8f3a10c7e1' },
      }),
    ).toBeNull();
    expect(
      readEvent({ event: { ...CORPS.event, app_user_id: 'pas-un-uuid' } }),
    ).toBeNull();
    expect(readEvent({ event: { ...CORPS.event, app_user_id: '' } })).toBeNull();
  });

  it('rend null sur un horodatage nettement en avance sur l’horloge', () => {
    // Un horodatage forgé au maximum représentable deviendrait `last_event_at`
    // et périmerait à jamais tout événement suivant, EXPIRATION comprise :
    // l'accès payant ne serait plus révocable que par un UPDATE à la main.
    expect(
      readEvent({ event: { ...CORPS.event, event_timestamp_ms: 8_640_000_000_000_000 } }),
    ).toBeNull();
  });

  it('tolère la dérive d’horloge entre RevenueCat et nous', () => {
    // La tolérance existe pour ça et pour rien d'autre : quelques secondes
    // d'avance ne sont pas une forgerie.
    const event = readEvent({
      event: { ...CORPS.event, event_timestamp_ms: Date.now() + 30_000 },
    });

    expect(event).not.toBeNull();
  });
});

describe('transitionFor', () => {
  it('ouvre un abonnement sur un achat, un renouvellement, un changement de produit et une reprise', () => {
    for (const type of ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION']) {
      expect(transitionFor(type)).toEqual({
        kind: 'grant',
        plan: 'subscription',
        status: 'active',
      });
    }
  });

  it('ouvre un lifetime sur un achat non renouvelable', () => {
    expect(transitionFor('NON_RENEWING_PURCHASE')).toEqual({
      kind: 'grant',
      plan: 'lifetime',
      status: 'active',
    });
  });

  it('ne change que le statut sur une fin, jamais le plan', () => {
    // Une EXPIRATION sur un lifetime remboursé doit retirer l'accès sans
    // réécrire le plan en « subscription », ce qui serait un mensonge.
    expect(transitionFor('CANCELLATION')).toEqual({ kind: 'status', status: 'cancelled' });
    expect(transitionFor('EXPIRATION')).toEqual({ kind: 'status', status: 'expired' });
    expect(transitionFor('BILLING_ISSUE')).toEqual({ kind: 'status', status: 'in_grace_period' });
  });

  it('rend null sur un type inconnu', () => {
    // RevenueCat en ajoute. Ne rien faire est le seul défaut acceptable.
    expect(transitionFor('TRANSFER')).toBeNull();
    expect(transitionFor('')).toBeNull();
  });

  it('ne lit pas la chaîne de prototypes', () => {
    // Avec des objets littéraux, `constructor` rendait une ouverture dont le
    // plan était une fonction : sérialisé, il ne restait que
    // `status: 'active'`, de quoi ranimer un droit expiré. `__proto__` rendait
    // un plan illisible, donc un 500 et un rejeu sans fin.
    expect(transitionFor('constructor')).toBeNull();
    expect(transitionFor('__proto__')).toBeNull();
    expect(transitionFor('toString')).toBeNull();
  });
});

describe('isAuthorized', () => {
  it('accepte le secret exact', () => {
    expect(isAuthorized('s3cr3t-partage', 's3cr3t-partage')).toBe(true);
  });

  it('refuse un secret faux, vide, ou absent', () => {
    expect(isAuthorized('autre-chose', 's3cr3t-partage')).toBe(false);
    expect(isAuthorized('', 's3cr3t-partage')).toBe(false);
    expect(isAuthorized(undefined, 's3cr3t-partage')).toBe(false);
  });

  it('refuse un secret de longueur différente sans lever', () => {
    // timingSafeEqual lève sur des tampons de tailles différentes : la garde
    // de longueur doit précéder l'appel, sinon le webhook répond 500 à ce qui
    // est un simple refus.
    expect(isAuthorized('court', 's3cr3t-partage-bien-plus-long')).toBe(false);
  });
});
