import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext, useImperativeHandle, useRef } from 'react';
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
import type { EdgeScroller } from './ui';

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
  /**
   * Reçoit de quoi piloter le défilement à la main, image par image — ce qu'une
   * liste réordonnable demande pour atteindre ce qui est hors écran.
   *
   * Sans effet quand `scroll` est faux : il n'y a alors pas de `ScrollView` à
   * piloter.
   */
  scrollerRef?: React.Ref<EdgeScroller>;
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
  scrollerRef,
  avoidKeyboard = false,
  children,
}: Props) {
  const insets = useSafeAreaInsets();

  const scrollView = useRef<ScrollView>(null);
  const frame = useRef<View>(null);
  // La position et les deux hauteurs qui la bornent, tenues en refs : le
  // pilotage se fait à chaque image, et un état les ferait rendre autant de
  // fois.
  const offset = useRef(0);
  const viewport = useRef(0);
  const content = useRef(0);

  useImperativeHandle(
    scrollerRef,
    () => ({
      // Sur la vue qui encadre le `ScrollView`, et non sur lui : c'est elle qui
      // porte des coordonnées de fenêtre exploitables sur les deux plateformes.
      measure: (onDone) => {
        frame.current?.measureInWindow((_x, y, _width, height) => {
          onDone({ top: y, bottom: y + height });
        });
      },
      scrollBy: (dy) => {
        const max = Math.max(0, content.current - viewport.current);
        const next = Math.min(max, Math.max(0, offset.current + dy));
        const moved = next - offset.current;
        if (moved === 0) return 0;

        // Noté d'avance : `onScroll` ne confirmera la position qu'à l'image
        // suivante, et l'appel d'ici là repartirait d'une valeur périmée.
        offset.current = next;
        scrollView.current?.scrollTo({ y: next, animated: false });
        return moved;
      },
    }),
    [],
  );

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
    // `collapsable={false}` : sans lui, Android fond cette vue dans son parent
    // au motif qu'elle ne peint rien, et il ne reste plus rien à mesurer.
    <View ref={frame} style={styles.fill} collapsable={false}>
      <ScrollView
        ref={scrollView}
        contentContainerStyle={[
          styles.content,
          // Sans footer, la dernière carte doit pouvoir remonter au-dessus du
          // bord physique de l'écran.
          footer ? null : { paddingBottom: bottomInset + spacing.block },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
        // Les trois hauteurs du pilotage manuel. `onScroll` les rafraîchit
        // toutes, mais il ne se déclenche qu'au premier défilement : les deux
        // autres rappels les donnent dès le montage, quand personne n'a encore
        // rien fait défiler.
        scrollEventThrottle={16}
        onScroll={(event) => {
          const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
          viewport.current = layoutMeasurement.height;
          content.current = contentSize.height;

          // La position, elle, n'est reprise que si personne ne pilote. Un
          // `scrollTo` met une image à se voir ici : la reprendre pendant le
          // pilotage ferait repartir l'image suivante d'une valeur périmée, qui
          // redemanderait la position déjà demandée tout en la comptant comme
          // acquise. Le cumul dérivait, puis se recalait — la ligne saisie
          // tremblait. `scrollEnabled` est faux exactement pendant ce
          // pilotage.
          if (scrollEnabled) offset.current = contentOffset.y;
        }}
        onLayout={(event) => {
          viewport.current = event.nativeEvent.layout.height;
        }}
        onContentSizeChange={(_width, height) => {
          content.current = height;
        }}
      >
        {head}
        {children}
      </ScrollView>
    </View>
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
