import { useEffect, useState } from 'react';

/**
 * L'instant courant, réévalué à intervalle régulier.
 *
 * Le chrono d'une séance a besoin de se redessiner sans que rien ne change dans
 * l'état : c'est le temps qui passe, pas la séance. Le garder dans le store le
 * ferait réécrire chaque seconde et re-rendrait tout ce qui l'observe.
 *
 * L'intervalle est repris à chaque changement de `intervalMs` et nettoyé au
 * démontage : un `setInterval` survivant à l'écran continuerait de réveiller
 * React pour un composant qui n'existe plus.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
