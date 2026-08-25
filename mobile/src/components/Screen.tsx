import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, gap, spacing, typography } from '../theme';
import { Button } from './ui';

/**
 * Ossature commune à tous les écrans.
 *
 * Elle existe pour une raison précise : le §04 du DA n'accorde aucun
 * `border-radius` et une seule marge latérale, donc chaque écran répéterait
 * exactement le même fond, la même gouttière et le même rythme de titre. Les
 * répéter à la main, c'est accepter qu'ils divergent d'un écran à l'autre.
 *
 * Les en-têtes de React Navigation sont désactivés au profit de ce titre en
 * Grenze : le DA dessine un titre d'écran (`typography.display.hero`), pas une
 * barre de navigation, et les deux ensemble feraient doublon.
 *
 * `footer` n'est pas décoratif : ce qui y est posé reste visible quand le corps
 * défile. C'est là que vont l'action principale et l'erreur de soumission —
 * une erreur affichée hors de vue équivaut à pas d'erreur.
 */

type Props = {
  /** Surtitre mono, en capitales. */
  eyebrow?: string;
  title?: string;
  /** Phrase d'introduction sous le titre. */
  intro?: string;
  /**
   * Retour arrière. Sa présence resserre le haut de l'écran : la barre occupe
   * la place que le retrait d'encoche du §05 laisse sinon vide.
   */
  onBack?: () => void;
  /** Épinglé en bas, hors défilement. */
  footer?: React.ReactNode;
  /** Faux pour un contenu qui gère son propre défilement (liste virtualisée). */
  scroll?: boolean;
  /**
   * Faux pour suspendre le défilement sans démonter le `ScrollView` : `scroll`
   * choisit le composant, `scrollEnabled` dit seulement s'il défile.
   */
  scrollEnabled?: boolean;
  /** Vrai sur un écran de saisie : remonte le contenu au-dessus du clavier. */
  avoidKeyboard?: boolean;
  children?: React.ReactNode;
};

export function Screen({
  eyebrow,
  title,
  intro,
  onBack,
  footer,
  scroll = true,
  scrollEnabled = true,
  avoidKeyboard = false,
  children,
}: Props) {
  const insets = useSafeAreaInsets();

  // Sous une barre d'onglets, l'inset bas est déjà absorbé par la barre :
  // l'ajouter une seconde fois creuserait un vide au-dessus d'elle. Le contexte
  // vaut `undefined` hors d'un onglet, ce qui distingue les deux cas sans avoir
  // à passer une prop depuis chaque écran.
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const bottomInset = tabBarHeight === undefined ? insets.bottom : 0;

  const head =
    eyebrow || title || intro ? (
      <View style={styles.head}>
        {eyebrow ? <Text style={typography.mono.eyebrow}>{eyebrow}</Text> : null}
        {title ? <Text style={typography.display.hero}>{title}</Text> : null}
        {intro ? <Text style={typography.sans.bodySmall}>{intro}</Text> : null}
      </View>
    ) : null;

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        // Sans footer, la dernière carte doit pouvoir remonter au-dessus du
        // bord physique de l'écran.
        footer ? null : { paddingBottom: bottomInset + spacing.block },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      scrollEnabled={scrollEnabled}
    >
      {head}
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill]}>
      {head}
      {children}
    </View>
  );

  return (
    <View
      style={[
        styles.page,
        // Le §05 pose un retrait franc sous l'encoche, en plus de l'inset
        // système. Une barre de retour occupe déjà cette hauteur.
        { paddingTop: insets.top + (onBack ? spacing.row : spacing.notch) },
      ]}
    >
      {onBack ? (
        <View style={styles.backBar}>
          <Button label="Retour" onPress={onBack} variant="tertiary" size="compact" />
        </View>
      ) : null}

      {avoidKeyboard ? (
        <KeyboardAvoidingView
          style={styles.fill}
          // Android redimensionne déjà la fenêtre ; doubler le décalage ferait
          // sauter le contenu au-dessus du clavier.
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}

      {footer ? (
        <View style={[styles.footer, { paddingBottom: bottomInset + spacing.block }]}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.surface.page,
  },
  fill: {
    flex: 1,
  },
  backBar: {
    paddingHorizontal: spacing.screen,
  },
  content: {
    gap: spacing.block,
    paddingHorizontal: spacing.screen,
    paddingBottom: spacing.block,
  },
  head: {
    gap: gap.title,
  },
  footer: {
    gap: spacing.row,
    paddingTop: spacing.block,
    paddingHorizontal: spacing.screen,
  },
});
