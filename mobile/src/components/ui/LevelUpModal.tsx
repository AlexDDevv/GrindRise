import { LinearGradient } from 'expo-linear-gradient';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Defs, RadialGradient, Rect, Stop, Svg } from 'react-native-svg';

import { formatNumber } from '../../lib/format';
import {
  border,
  colors,
  diamond,
  fragmentGlyphWidth,
  gap,
  gradient,
  maxWidth,
  padding,
  scrim,
  shadow,
  spacing,
  typography,
} from '../../theme';
import { Button } from './Button';
import { Hexagon } from './Hexagon';
import { LevelMedallion } from './LevelMedallion';
import { XpBar } from './XpBar';
import { useSvgId } from './useSvgId';

/**
 * Modale de level-up — `Composants detail.dc.html` 05.
 *
 * Deux intensités pour deux événements. `levelUp` est la cérémonie : bandeau
 * rouge plein, médaillon d'or massif, une occurrence par palier. `fragment`
 * est la même mise en scène rentrée d'un cran — le rouge passe en voile, l'or
 * disparaît, l'action devient secondaire — parce qu'un fragment se débloque
 * souvent et ne doit pas user l'effet du palier.
 *
 * Le voile radial du DA est posé dans les deux cas : c'est le cadre, le
 * bandeau et l'emblème qui portent la différence, pas le fond.
 */

/** Tout ce que la variante change dans l'habillage, en un seul endroit. */
const TONE = {
  levelUp: {
    banner: 'PALIER FRANCHI',
    bannerLabel: colors.modal.bannerCeremonyLabel,
    borderColor: colors.modal.ceremonyBorder,
    fill: gradient.modalCeremony,
    action: 'primary',
  },
  fragment: {
    banner: 'FRAGMENT DÉBLOQUÉ',
    bannerLabel: colors.modal.bannerQuietLabel,
    borderColor: colors.line.default,
    fill: gradient.modalQuiet,
    action: 'secondary',
  },
} as const;

type Props = {
  visible: boolean;
  /** Fermeture par le bouton d'écart ou par le retour arrière Android. */
  onClose: () => void;
  /** Titre du palier ou du fragment, en Grenze. */
  title: string;
  /** Phrase de lore. Un `Text` imbriqué permet d'y accentuer un nom propre. */
  lore: React.ReactNode;
  action: { label: string; onPress: () => void };
  /** Libellé de l'écart : « Plus tard », « Fermer ». */
  dismissLabel: string;
} & (
  | {
      variant: 'levelUp';
      level: number;
      /** Progression rouverte par le palier, et le niveau qu'elle vise. */
      xp: { value: number; max: number; nextLevel: number };
    }
  | { variant: 'fragment' }
);

export function LevelUpModal(props: Props) {
  const { visible, onClose, lore, action, dismissLabel, variant } = props;
  const tone = TONE[variant];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <CeremonyScrim />

        <LinearGradient
          colors={[...tone.fill.colors]}
          start={tone.fill.start}
          end={tone.fill.end}
          style={[styles.card, { borderColor: tone.borderColor }]}
        >
          <View
            style={[
              styles.banner,
              variant === 'levelUp' ? styles.bannerCeremony : styles.bannerQuiet,
            ]}
          >
            <Text style={[typography.sans.banner, { color: tone.bannerLabel }]}>{tone.banner}</Text>
          </View>

          <View style={styles.body}>
            {props.variant === 'levelUp' ? (
              <CeremonyHead level={props.level} title={props.title} />
            ) : (
              <FragmentHead title={props.title} />
            )}

            <Text style={[typography.display.lore, styles.lore]}>{lore}</Text>

            {props.variant === 'levelUp' ? (
              <View style={styles.gauge}>
                <XpBar
                  value={props.xp.value}
                  max={props.xp.max}
                  caption={`${formatNumber(props.xp.value)} / ${formatNumber(props.xp.max)} XP vers le niveau ${props.xp.nextLevel}`}
                />
              </View>
            ) : null}

            <View style={styles.action}>
              <Button
                label={action.label}
                onPress={action.onPress}
                variant={tone.action}
                size="ceremony"
              />
            </View>

            <Button label={dismissLabel} onPress={onClose} variant="tertiary" size="ceremony" />
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

/** Palier franchi : le médaillon d'or, puis le titre que le palier ouvre. */
function CeremonyHead({ level, title }: { level: number; title: string }) {
  return (
    <>
      <LevelMedallion level={level} size="ceremony" />
      <View style={styles.titleBlock}>
        <Text style={typography.mono.eyebrow}>NOUVEAU TITRE</Text>
        <Text style={typography.display.ceremony}>{title}</Text>
      </View>
    </>
  );
}

/** Fragment débloqué : l'emblème du codex, sans or ni surtitre. */
function FragmentHead({ title }: { title: string }) {
  return (
    <>
      <Hexagon width={fragmentGlyphWidth} fill={colors.modal.fragmentGlyphBackground}>
        <View style={styles.fragmentGlyph} />
      </Hexagon>
      <Text style={[typography.display.fragment, styles.centered]}>{title}</Text>
    </>
  );
}

/**
 * Voile du DA : `radial-gradient(90% 50% at 50% 42%, …)`. React Native n'a pas
 * de dégradé radial en style, il est donc tracé en SVG plein écran. Sans
 * dimensions explicites, le SVG retombe sur sa taille intrinsèque et le voile
 * ne couvre qu'une bande en haut de l'écran.
 */
function CeremonyScrim() {
  const gradientId = useSvgId('scrim');

  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient
          id={gradientId}
          cx={scrim.ceremony.centerX}
          cy={scrim.ceremony.centerY}
          rx={scrim.ceremony.radiusX}
          ry={scrim.ceremony.radiusY}
        >
          <Stop offset="0" stopColor={scrim.ceremony.from} />
          <Stop offset="1" stopColor={scrim.ceremony.to} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.screen,
  },
  card: {
    width: '100%',
    borderWidth: border.hairline,
    boxShadow: [shadow.modal],
  },

  banner: {
    paddingVertical: padding.modalBanner,
    alignItems: 'center',
  },
  bannerCeremony: {
    backgroundColor: colors.modal.bannerCeremony,
  },
  bannerQuiet: {
    backgroundColor: colors.modal.bannerQuiet,
    borderBottomWidth: border.hairline,
    borderBottomColor: colors.modal.bannerQuietBorder,
  },

  body: {
    alignItems: 'center',
    gap: gap.modal,
    paddingVertical: padding.modalBody.y,
    paddingHorizontal: padding.modalBody.x,
  },

  fragmentGlyph: {
    width: diamond.fragment.size,
    height: diamond.fragment.size,
    borderWidth: diamond.fragment.stroke,
    borderColor: colors.modal.fragmentGlyph,
    transform: [{ rotate: '45deg' }],
  },

  titleBlock: {
    alignItems: 'center',
    gap: gap.title,
  },
  centered: {
    textAlign: 'center',
  },
  lore: {
    maxWidth: maxWidth.lore,
    textAlign: 'center',
  },
  gauge: {
    width: '100%',
  },
  action: {
    width: '100%',
    marginTop: gap.line,
  },
});
