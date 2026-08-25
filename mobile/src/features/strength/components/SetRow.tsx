import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  border,
  colors,
  gap,
  padding,
  setRow,
  touchTarget,
  typography,
} from '../../../theme';
import { formatSeconds, repsUnit } from '../sessionStats';
import type { SetDraft } from '../types';

/**
 * Une ligne de série — maquette 09, composant 06.
 *
 * Un seul composant pour les six variantes du DA : elles ne diffèrent que par
 * leurs props. Écrire six rendus ferait diverger la grille au premier
 * ajustement.
 *
 * La grille est fixe à trois colonnes — rang, comptage, charge — pour que la
 * charge reste alignée d'une ligne à l'autre. C'est la colonne qu'on relit
 * pendant une séance, et un `flex` qui la ferait danser d'une ligne à l'autre
 * la rendrait illisible.
 *
 * `PDC` est un label mono et non une phrase : il dit le sens de la charge sans
 * l'expliquer, ce que le §03 réserve exactement à cette famille.
 */

type Props = {
  /** Rang affiché, à partir de 1. */
  index: number;
  /** Nulle pour une ligne encore vide, qui appelle la valeur. */
  set: SetDraft | null;
  /** Ligne en cours de saisie : voile d'or et liseré. */
  active?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

export function SetRow({ index, set, active = false, onPress, onLongPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabelOf(index, set)}
      style={({ pressed }) => [
        styles.row,
        active && styles.rowActive,
        pressed && styles.rowPressed,
      ]}
    >
      <Text style={[styles.index, active && styles.indexActive]}>{index}</Text>

      <Count set={set} />
      <Load set={set} />
    </Pressable>
  );
}

/** Colonne du milieu : répétitions ou durée. */
function Count({ set }: { set: SetDraft | null }) {
  if (set === null) return <EmptyValue unit="réps" />;

  return set.type === 'reps' ? (
    // L'accord de l'unité est centralisé dans `repsUnit` : la règle a déjà
    // divergé deux fois dans ce chantier. L'étiquette d'accessibilité décline
    // déjà, le texte visible doit s'aligner dessus.
    <Value value={String(set.reps)} unit={repsUnit(set.reps)} />
  ) : (
    // Sans unité : `0:45` se lit déjà comme une durée, et la colonne dit
    // « TEMPS ». Un « min » collé à une planche de 45 secondes serait faux.
    <Value value={formatSeconds(set.durationSeconds)} />
  );
}

/**
 * Colonne de droite : la charge, dont le sens dépend du poids du corps.
 *
 * `Count` rend un `Text` sans flex ; c'est `Load` qui est poussé à droite par
 * un `marginLeft: 'auto'` sur son enveloppe. Ajouter `flex: 1` à `Count`
 * casserait l'alignement de la charge d'une ligne à l'autre.
 */
function Load({ set }: { set: SetDraft | null }) {
  return <View style={styles.load}>{renderLoad(set)}</View>;
}

/**
 * Quatre cas et un seul endroit où ils vivent — c'est là que se lit la
 * différence entre une traction nue, une traction lestée et un développé.
 */
function renderLoad(set: SetDraft | null) {
  if (set === null) return <EmptyValue unit="kg" />;

  if (!set.isBodyweight) {
    return set.weightKg === null ? (
      <EmptyValue unit="kg" />
    ) : (
      <Value value={String(set.weightKg)} unit="kg" />
    );
  }

  if (set.weightKg === null) return <Text style={styles.bodyweight}>PDC</Text>;

  return (
    <>
      <Text style={styles.bodyweight}>PDC</Text>
      <Value value={`+${set.weightKg}`} unit="kg" />
    </>
  );
}

/** @param unit omise quand la valeur porte déjà son sens, comme `2:05`. */
function Value({ value, unit }: { value: string; unit?: string }) {
  return (
    <Text style={typography.sans.metric} numberOfLines={1}>
      {value}
      {unit ? <Text style={typography.sans.unit}> {unit}</Text> : null}
    </Text>
  );
}

/** Le tiret cadratin s'efface avec son unité : la colonne reste lisible. */
function EmptyValue({ unit }: { unit: string }) {
  return (
    <Text style={[typography.sans.metric, styles.empty]} numberOfLines={1}>
      —<Text style={[typography.sans.unit, styles.empty]}> {unit}</Text>
    </Text>
  );
}

function accessibilityLabelOf(index: number, set: SetDraft | null): string {
  if (set === null) return `Série ${index}, à remplir`;

  const count =
    set.type === 'reps'
      ? `${set.reps} répétition${set.reps > 1 ? 's' : ''}`
      : `${set.durationSeconds} seconde${set.durationSeconds > 1 ? 's' : ''}`;

  const load = set.isBodyweight
    ? set.weightKg === null
      ? 'au poids du corps'
      : `au poids du corps, lesté de ${set.weightKg} kilos`
    : set.weightKg === null
      ? 'sans charge'
      : `${set.weightKg} kilos`;

  return `Série ${index}, ${count}, ${load}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: gap.row,
    height: touchTarget.minimum,
    paddingHorizontal: padding.dense.x,
    borderTopWidth: border.hairline,
    borderTopColor: colors.strength.setSeparator,
  },
  rowActive: {
    backgroundColor: colors.strength.activeRowBackground,
    borderLeftWidth: setRow.activeBar,
    borderLeftColor: colors.strength.activeRowBar,
  },
  rowPressed: {
    backgroundColor: colors.strength.activeRowBackground,
  },
  index: {
    ...typography.mono.meta,
    width: setRow.indexColumn,
  },
  indexActive: {
    color: colors.strength.activeRowIndex,
  },
  empty: {
    color: colors.strength.emptyValue,
  },
  bodyweight: {
    ...typography.mono.meta,
    color: colors.text.secondary,
  },
  load: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: gap.line,
  },
});
