import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChoiceCard } from '../../../components/ChoiceCard';
import { Screen } from '../../../components/Screen';
import { Button } from '../../../components/ui';
import {
  border,
  colors,
  gap,
  padding,
  spacing,
  typography,
} from '../../../theme';
import type { LogStackParamList } from '../../../navigation/types';
import { fullName, locate, programCountLabel } from '../../programs/programState';
import { useLastProgramWorkout } from '../../programs/useLastProgramWorkout';
import { usePrograms } from '../../programs/usePrograms';
import { useStrengthSessionStore } from '../strengthSessionStore';

/**
 * Départ d'une séance de musculation — maquette 10, écran Ⓐ.
 *
 * L'écran qui manquait, et il porte à lui seul la règle de navigation : **les
 * programmes sont de la musculation.** L'onglet SÉANCE choisit la discipline ;
 * choisir la musculation ouvre ce départ, d'où partent les deux branches, et
 * les trois autres sports ne le voient jamais. C'est ce qui évite un quatrième
 * onglet qui afficherait une section vide pour un coureur, et qui laisse la
 * quatrième place au codex.
 *
 * **La séance libre est présélectionnée** : un habitué garde deux appuis, et
 * c'est le parcours qui existait avant les programmes.
 *
 * Un mur payant, s'il arrive un jour, se pose sur la carte des programmes — un
 * seul point de contact, sans toucher à la barre d'onglets.
 */

type Branch = 'free' | 'programs';

export function StrengthStartScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<LogStackParamList>>();
  const startSession = useStrengthSessionStore((s) => s.start);

  const { programs } = usePrograms();
  const lastWorkoutId = useLastProgramWorkout();

  const [branch, setBranch] = useState<Branch>('free');

  const last =
    programs && lastWorkoutId ? locate(programs, lastWorkoutId) : null;

  return (
    <Screen
      eyebrow="MUSCULATION"
      title="Comment tu démarres ?"
      onBack={() => navigation.goBack()}
      footer={
        <Button
          label="Continuer"
          size="hero"
          onPress={() => {
            if (branch === 'programs') {
              navigation.navigate('Programs');
              return;
            }

            // Le chrono part ici et non à l'ajout du premier exercice : la
            // séance a commencé quand on ouvre l'écran, pas quand on trouve son
            // premier mouvement dans le catalogue.
            startSession();
            navigation.navigate('StrengthSession');
          }}
        />
      }
    >
      <View style={styles.branches}>
        <ChoiceCard
          title="Séance libre"
          subtitle="Tu choisis les exercices au fil de la séance."
          selected={branch === 'free'}
          onPress={() => setBranch('free')}
        />

        <ChoiceCard
          title="Mes programmes"
          subtitle="Un ordre d'exercices préparé à l'avance, prêt à lancer."
          // Tant que la lecture est en vol, la carte ne montre aucun décompte
          // plutôt qu'un zéro : « aucun programme » est une information, et la
          // donner à tort découragerait d'ouvrir l'écran.
          meta={programs ? programCountLabel(programs) : undefined}
          footer={
            last ? (
              <>
                <Text style={typography.mono.meta}>DERNIER</Text>
                <Text style={styles.lastName} numberOfLines={1}>
                  {fullName(last.program, last.workout)}
                </Text>
              </>
            ) : undefined
          }
          selected={branch === 'programs'}
          onPress={() => setBranch('programs')}
        />
      </View>

      <View style={styles.otherSports}>
        <Text style={typography.mono.meta}>POUR LES AUTRES SPORTS</Text>
        <Text style={typography.sans.bodySmall}>
          Course, vélo et natation se loguent en une fois : elles n'ont pas de
          programmes.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  branches: {
    gap: spacing.row,
  },
  lastName: {
    ...typography.sans.caption,
    flex: 1,
  },
  otherSports: {
    gap: gap.line,
    paddingVertical: padding.dense.y,
    paddingHorizontal: padding.dense.x,
    backgroundColor: colors.surface.raised,
    borderWidth: border.hairline,
    borderColor: colors.line.default,
  },
});
