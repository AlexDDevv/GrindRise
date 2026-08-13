import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import {
  border,
  colors,
  fontFamily,
  gap,
  padding,
  touchTarget,
  typography,
} from '../theme';

/**
 * Champ de saisie : email, code OTP, métrique de séance.
 *
 * Le fond est le creux du §02 (`surface.well`), celui des pistes de jauge — un
 * champ est un vide qu'on remplit, il s'enfonce, il ne se surélève pas. Le
 * filet passe à l'or au focus, seul état que le DA accorde à un contrôle actif.
 *
 * La valeur saisie est en IBM Plex avec `tabular-nums` (`metricInline`) et non
 * en texte courant : ce sont des chiffres qu'on relit et qu'on corrige, ils
 * doivent s'aligner d'une ligne à l'autre.
 */

type Props = {
  label: string;
  /** Unité accolée au libellé : « kg », « km », « min ». */
  unit?: string;
  /** Mention « facultatif » sous le libellé, quand le serveur ne l'exige pas. */
  optional?: boolean;
  /** Saisie centrée et espacée, pour un code à usage unique. */
  emphasis?: boolean;
} & Omit<TextInputProps, 'style' | 'placeholderTextColor'>;

export function TextField({ label, unit, optional, emphasis, ...input }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={typography.sans.metricLabel}>
        {label.toUpperCase()}
        {unit ? ` (${unit})` : ''}
        {optional ? ' — FACULTATIF' : ''}
      </Text>

      <TextInput
        {...input}
        onFocus={(event) => {
          setFocused(true);
          input.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          input.onBlur?.(event);
        }}
        style={[styles.input, emphasis && styles.emphasis, focused && styles.focused]}
        placeholderTextColor={colors.text.label}
        selectionColor={colors.accent.gold}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: gap.line,
  },
  input: {
    ...typography.sans.metricInline,
    minHeight: touchTarget.field,
    paddingHorizontal: padding.card.x,
    backgroundColor: colors.surface.well,
    borderWidth: border.hairline,
    borderColor: colors.line.control,
    color: colors.text.data,
  },
  focused: {
    borderColor: colors.accent.gold,
  },
  emphasis: {
    // Le cran héros du §03, sans son interligne : dans un `TextInput`, un
    // `lineHeight` supérieur à la hauteur de ligne du clavier rogne les
    // glyphes sur Android.
    fontSize: 28,
    lineHeight: undefined,
    fontFamily: fontFamily.sansBold,
    textAlign: 'center',
    // Un code se lit chiffre par chiffre : l'écart les détache sans avoir à
    // dessiner six cases séparées.
    letterSpacing: 8,
  },
});
