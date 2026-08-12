import { Grenze_400Regular, Grenze_700Bold } from '@expo-google-fonts/grenze';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { fontFamily } from './typography';

/**
 * Chargement des trois familles du DA.
 *
 * Les clés sont exactement les `fontFamily` de `typography.ts` : c'est le seul
 * endroit où le nom d'une police est associé à son fichier. Seuls les sept
 * poids réellement employés par le DA sont embarqués — le lien Google Fonts du
 * document en déclare deux de plus (Grenze 600, JetBrains Mono 400) qu'aucun
 * composant n'utilise.
 */
const appFonts = {
  [fontFamily.displayRegular]: Grenze_400Regular,
  [fontFamily.displayBold]: Grenze_700Bold,
  [fontFamily.sansRegular]: IBMPlexSans_400Regular,
  [fontFamily.sansMedium]: IBMPlexSans_500Medium,
  [fontFamily.sansSemiBold]: IBMPlexSans_600SemiBold,
  [fontFamily.sansBold]: IBMPlexSans_700Bold,
  [fontFamily.monoMedium]: JetBrainsMono_500Medium,
};

// Le splash reste affiché tant que les polices ne sont pas là : sans ça, le
// premier rendu passerait par la police système avant de sauter sur Grenze.
// L'échec n'est pas bloquant — au pire l'écran natif se masque tout seul.
void SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Rend `true` quand l'app peut se dessiner, et masque le splash natif au même
 * moment. En cas d'erreur de chargement on laisse passer quand même : une
 * police de repli vaut mieux qu'un écran bloqué.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(appFonts);
  const ready = loaded || error !== null;

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  return ready;
}
