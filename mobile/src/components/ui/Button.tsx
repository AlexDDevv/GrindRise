import { Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { border, colors, cutCorner, padding, touchTarget, typography } from '../../theme';
import { CutCornerSurface } from './CutCornerSurface';

/**
 * Bouton — `Composants detail.dc.html` 01.
 *
 * Trois niveaux : le primaire porte l'or et le coin coupé, le secondaire n'a
 * qu'un filet, le tertiaire n'est qu'un mot. Le coin coupé est réservé au
 * primaire — c'est le DA qui le réserve aux boutons pleins.
 *
 * `size` ne change pas que la hauteur, il dit où le bouton se pose :
 * `compact` en ligne dans un écran, `ceremony` dans une modale où tout se
 * resserre et où le filet monte d'un cran pour tenir sur le fond dégradé.
 */

type ButtonVariant = 'primary' | 'secondary' | 'tertiary';
type ButtonSize = 'full' | 'compact' | 'ceremony';

/** L'état d'interaction, transporté d'un bloc à l'autre plutôt que recalculé. */
type State = { pressed: boolean; disabled: boolean };

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'full',
  disabled = false,
}: Props) {
  const isCompact = size === 'compact';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={isCompact ? styles.inline : styles.fullWidth}
    >
      {({ pressed }) => {
        const state: State = { pressed: pressed && !disabled, disabled };

        const box = [
          styles.box,
          { height: heightFor(variant, size) },
          isCompact ? styles.compact : styles.stretch,
        ];

        const text = (
          <Text style={[labelStyle(variant, isCompact), { color: labelColor(variant, state) }]} numberOfLines={1}>
            {label}
          </Text>
        );

        if (variant === 'primary') {
          return (
            <CutCornerSurface
              cut={isCompact ? cutCorner.compact : cutCorner.full}
              color={fillColor(state)}
              style={box}
            >
              {text}
            </CutCornerSurface>
          );
        }

        if (variant === 'secondary') {
          return (
            <View style={[box, styles.outlined, { borderColor: outlineColor(size, state) }]}>
              {text}
            </View>
          );
        }

        return <View style={box}>{text}</View>;
      }}
    </Pressable>
  );
}

/**
 * Le tertiaire et le compact tiennent tous deux sur le plancher tactile ; la
 * modale resserre les deux autres ; seul un bouton pleine largeur d'écran
 * distingue le primaire du secondaire.
 */
function heightFor(variant: ButtonVariant, size: ButtonSize): number {
  if (variant === 'tertiary' || size === 'compact') return touchTarget.minimum;
  if (size === 'ceremony') return touchTarget.ceremony;
  return variant === 'primary' ? touchTarget.primary : touchTarget.secondary;
}

function labelStyle(variant: ButtonVariant, isCompact: boolean): TextStyle {
  if (variant === 'secondary') return typography.sans.buttonSecondary;
  if (variant === 'tertiary') return typography.sans.buttonTertiary;
  return isCompact ? typography.sans.buttonCompact : typography.sans.button;
}

function fillColor({ pressed, disabled }: State): string {
  if (disabled) return colors.button.primaryBackgroundDisabled;
  return pressed ? colors.button.primaryBackgroundPressed : colors.button.primaryBackground;
}

function outlineColor(size: ButtonSize, { pressed, disabled }: State): string {
  if (disabled) return colors.line.default;
  if (pressed) return colors.button.secondaryBorderPressed;
  return size === 'ceremony' ? colors.line.controlOnModal : colors.line.control;
}

function labelColor(variant: ButtonVariant, { pressed, disabled }: State): string {
  if (variant === 'primary') {
    return disabled ? colors.button.primaryLabelDisabled : colors.button.primaryLabel;
  }

  // Le DA ne dessine l'état désactivé que pour le primaire. Les deux autres
  // retombent sur l'opacité de label du §02 plutôt que sur une teinte inventée.
  if (disabled) return colors.text.label;

  if (variant === 'secondary') {
    return pressed ? colors.button.secondaryLabelPressed : colors.button.secondaryLabel;
  }

  return pressed ? colors.button.tertiaryLabelPressed : colors.button.tertiaryLabel;
}

const styles = StyleSheet.create({
  fullWidth: {
    width: '100%',
  },
  inline: {
    alignSelf: 'flex-start',
  },
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stretch: {
    width: '100%',
  },
  compact: {
    paddingHorizontal: padding.buttonCompact,
  },
  outlined: {
    borderWidth: border.hairline,
    backgroundColor: colors.transparent,
  },
});
