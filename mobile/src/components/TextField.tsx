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
  /**
   * Traitement particulier de la valeur.
   *
   * `code` — saisie centrée et espacée, pour un code à usage unique.
   * `metric` — grand chiffre centré, avec son unité posée dans la boîte :
   *   c'est le champ de saisie d'une série (maquette 09, écran ③), où la valeur
   *   se relit à distance de bras pendant l'effort.
   */
  emphasis?: 'code' | 'metric';
  /** Unité rendue à côté de la valeur, à l'intérieur de la boîte. `metric` seul. */
  unitInline?: string;
} & Omit<TextInputProps, 'style' | 'placeholderTextColor'>;

export function TextField({
  label,
  unit,
  optional,
  emphasis,
  unitInline,
  ...input
}: Props) {
  const [focused, setFocused] = useState(false);

  const field = (
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
      style={[
        styles.input,
        emphasis === 'code' && styles.code,
        emphasis === 'metric' && styles.metric,
        // Un champ `metric` porte son filet sur la boîte qui l'enveloppe :
        // le laisser aussi sur l'input dessinerait deux cadres.
        emphasis === 'metric' ? styles.borderless : focused && styles.focused,
      ]}
      placeholderTextColor={colors.text.label}
      selectionColor={colors.accent.gold}
      accessibilityLabel={label}
    />
  );

  return (
    <View style={styles.field}>
      <Text style={typography.sans.metricLabel}>
        {label.toUpperCase()}
        {unit ? ` (${unit})` : ''}
        {optional ? ' — FACULTATIF' : ''}
      </Text>

      {emphasis === 'metric' ? (
        <View style={[styles.metricBox, focused && styles.focused]}>
          {field}
          {unitInline ? (
            <Text style={typography.sans.unit}>{unitInline}</Text>
          ) : null}
        </View>
      ) : (
        field
      )}
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
  code: {
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
  metric: {
    ...typography.sans.metricField,
    lineHeight: undefined,
    textAlign: 'right',
    minHeight: undefined,
    // Annule le rembourrage du style de base : c'est `metricBox` qui le porte
    // désormais, et le cumuler décalerait le chiffre de sa boîte.
    paddingHorizontal: 0,
    backgroundColor: colors.transparent,
    flexShrink: 1,
  },
  borderless: {
    borderWidth: border.none,
  },
  metricBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: gap.line,
    minHeight: touchTarget.field,
    paddingHorizontal: padding.card.x,
    backgroundColor: colors.surface.well,
    borderWidth: border.hairline,
    borderColor: colors.line.control,
  },
});
