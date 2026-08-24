import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  LevelMedallion,
  LevelUpModal,
  ReorderableList,
  SegmentedControl,
  Switch,
  WorkoutCard,
  XpBar,
} from '../components/ui';
import { ExerciseCard } from '../features/strength/components/ExerciseCard';
import { SetRow } from '../features/strength/components/SetRow';
import { border, colors, gap, padding, spacing, touchTarget, typography } from '../theme';

/**
 * Banc d'essai du thème.
 *
 * Ce n'est pas un écran de l'app : il n'existe que pour vérifier que les cinq
 * composants prioritaires tiennent debout sur les seules valeurs du thème,
 * avant de les appliquer à de vrais écrans. Il s'ouvre en posant
 * `EXPO_PUBLIC_THEME_GALLERY=1` dans `.env`.
 */

type SectionProps = {
  number: string;
  title: string;
  children: React.ReactNode;
};

function Section({ number, title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={typography.mono.label}>
        {number} — {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Variant({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.variant}>
      <Text style={typography.mono.meta}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

export function ThemeGalleryScreen() {
  const [modal, setModal] = useState<'levelUp' | 'fragment' | null>(null);
  const [setType, setSetType] = useState<'reps' | 'time'>('reps');
  const [bodyweight, setBodyweight] = useState(false);
  const [ordre, setOrdre] = useState(['Développé couché', 'Développé militaire', 'Dips']);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.masthead}>
          <Text style={typography.mono.eyebrow}>GRINDRISE — DIRECTION ARTISTIQUE</Text>
          <Text style={typography.display.hero}>Braise &amp; parchemin</Text>
          <Text style={typography.sans.bodySmall}>
            Les cinq composants prioritaires, rendus sur les seules valeurs du thème.
          </Text>
        </View>

        <Section number="01" title="Bouton">
          <Variant label="Primaire">
            <Button label="Logger une séance" onPress={() => {}} />
          </Variant>
          <Variant label="Primaire · désactivé">
            <Button label="Logger une séance" disabled />
          </Variant>
          <Variant label="Secondaire">
            <Button label="Voir le codex" variant="secondary" onPress={() => {}} />
          </Variant>
          <Variant label="Tertiaire">
            <Button label="Plus tard" variant="tertiary" onPress={() => {}} />
          </Variant>
          <Variant label="Compact">
            <Button label="Améliorer" size="compact" onPress={() => {}} />
          </Variant>
        </Section>

        <Section number="02" title="Barre d'XP">
          <Variant label="Standard">
            <XpBar value={2450} max={3200} title="Vétéran" caption="750 XP avant niveau 13" />
          </Variant>
          <Variant label="Nue">
            <XpBar value={34} max={100} />
          </Variant>
          <Variant label="Début de palier">
            <XpBar value={7} max={100} />
          </Variant>
          <Variant label="Palier complet">
            <XpBar value={100} max={100} />
          </Variant>
        </Section>

        <Section number="03" title="Médaillon de niveau">
          <View style={styles.row}>
            <Variant label="S · listes">
              <LevelMedallion level={12} size="s" />
            </Variant>
            <Variant label="M · dashboard">
              <LevelMedallion level={12} size="m" />
            </Variant>
            <Variant label="L · profil">
              <LevelMedallion level={12} size="l" />
            </Variant>
          </View>
          <View style={styles.row}>
            <Variant label="Plein · level-up">
              <LevelMedallion level={13} size="ceremony" />
            </Variant>
            <Variant label="Verrouillé">
              <LevelMedallion level={14} size="m" locked />
            </Variant>
          </View>
        </Section>

        <Section number="04" title="Carte de séance">
          <Variant label="Compacte">
            <WorkoutCard
              variant="compact"
              sport="Musculation"
              summary="Hier · 52 min · 4 120 kg"
              xpGain={180}
              onPress={() => {}}
            />
          </Variant>
          <Variant label="Détaillée · musculation">
            <WorkoutCard
              variant="detailed"
              sport="Musculation"
              xpGain={180}
              metrics={[
                { label: 'Exos', value: '5' },
                { label: 'Séries', value: '18' },
                { label: 'Volume', value: '4 120', unit: 'kg' },
              ]}
              loggedAt="Lundi 10 août · 19 h 40"
            />
          </Variant>
          <Variant label="Détaillée · course à pied">
            <WorkoutCard
              variant="detailed"
              sport="Course à pied"
              xpGain={140}
              metrics={[
                { label: 'Distance', value: '8,2', unit: 'km' },
                { label: 'Allure', value: '4:52', unit: '/km' },
                { label: 'Durée', value: '40:03' },
              ]}
              loggedAt="Mardi 11 août · 06 h 25"
            />
          </Variant>
        </Section>

        <Section number="05" title="Modale de level-up">
          <Variant label="Palier franchi">
            <Button label="Ouvrir la cérémonie" onPress={() => setModal('levelUp')} />
          </Variant>
          <Variant label="Fragment débloqué">
            <Button
              label="Ouvrir le fragment"
              variant="secondary"
              onPress={() => setModal('fragment')}
            />
          </Variant>
        </Section>

        <Section number="06" title="Contrôles de saisie">
          <Variant label="Sélecteur répétitions / temps">
            <SegmentedControl
              options={[
                { value: 'reps', label: 'Répétitions' },
                { value: 'time', label: 'Temps' },
              ]}
              value={setType}
              onChange={setSetType}
              accessibilityLabel="Type de série"
            />
          </Variant>
          <Variant label="Interrupteur">
            <Switch
              label="Au poids du corps"
              value={bodyweight}
              onValueChange={setBodyweight}
            />
          </Variant>
        </Section>

        <Section number="07" title="Liste réordonnable">
          <ReorderableList
            data={ordre}
            keyOf={(nom) => nom}
            rowHeight={touchTarget.row}
            onMove={(from, to) => {
              setOrdre((courant) => {
                const suivant = [...courant];
                const [deplace] = suivant.splice(from, 1);
                suivant.splice(to, 0, deplace);
                return suivant;
              });
            }}
            renderItem={(nom, index, handle) => (
              <Pressable
                onPressIn={handle.onPressIn}
                onPressOut={handle.onPressOut}
                style={styles.reorderRow}
              >
                <Text style={typography.mono.meta}>{index + 1}</Text>
                <Text style={typography.display.cardTitleCompact}>{nom}</Text>
              </Pressable>
            )}
          />
        </Section>

        <Section number="08" title="Séance de musculation">
          <Variant label="Charge externe · 3 séries">
            <ExerciseCard
              exercise={{
                key: 'g1',
                exerciseId: 'x',
                name: 'Développé couché',
                muscleGroup: 'pectoraux',
                collapsed: false,
                sets: [
                  { type: 'reps', reps: 10, weightKg: 80, isBodyweight: false },
                  { type: 'reps', reps: 8, weightKg: 90, isBodyweight: false },
                  { type: 'reps', reps: 6, weightKg: 95, isBodyweight: false },
                ],
              }}
              canAddSet
              onAddSet={() => {}}
              onPressSet={() => {}}
              onLongPressSet={() => {}}
              onToggleCollapsed={() => {}}
              onLongPressHeader={() => {}}
            />
          </Variant>

          <Variant label="Poids du corps · dont une lestée">
            <ExerciseCard
              exercise={{
                key: 'g2',
                exerciseId: 'y',
                name: 'Tractions',
                muscleGroup: 'dos',
                collapsed: false,
                sets: [
                  { type: 'reps', reps: 8, weightKg: null, isBodyweight: true },
                  { type: 'reps', reps: 6, weightKg: 10, isBodyweight: true },
                ],
              }}
              canAddSet
              onAddSet={() => {}}
              onPressSet={() => {}}
              onLongPressSet={() => {}}
              onToggleCollapsed={() => {}}
              onLongPressHeader={() => {}}
            />
          </Variant>

          <Variant label="Temps, et ligne vide">
            <SetRow
              index={1}
              set={{ type: 'time', durationSeconds: 45, weightKg: 20, isBodyweight: false }}
            />
            <SetRow index={2} set={null} />
            <SetRow
              index={3}
              active
              set={{ type: 'reps', reps: 6, weightKg: 95, isBodyweight: false }}
            />
          </Variant>

          <Variant label="Repliée">
            <ExerciseCard
              exercise={{
                key: 'g3',
                exerciseId: 'y',
                name: 'Tractions',
                muscleGroup: 'dos',
                collapsed: true,
                sets: [
                  { type: 'reps', reps: 8, weightKg: null, isBodyweight: true },
                  { type: 'reps', reps: 6, weightKg: 10, isBodyweight: true },
                ],
              }}
              canAddSet
              onAddSet={() => {}}
              onPressSet={() => {}}
              onLongPressSet={() => {}}
              onToggleCollapsed={() => {}}
              onLongPressHeader={() => {}}
            />
          </Variant>
        </Section>
      </ScrollView>

      <LevelUpModal
        visible={modal === 'levelUp'}
        variant="levelUp"
        level={13}
        title="Vétéran aguerri"
        lore={
          <>
            L&apos;acier tient. Le chapitre 4 du codex s&apos;ouvre :{' '}
            <Text style={styles.loreAccent}>L&apos;appel de la forge</Text>.
          </>
        }
        xp={{ value: 260, max: 3600, nextLevel: 14 }}
        action={{ label: 'Lire le chapitre', onPress: () => setModal(null) }}
        dismissLabel="Plus tard"
        onClose={() => setModal(null)}
      />

      <LevelUpModal
        visible={modal === 'fragment'}
        variant="fragment"
        title="Le troisième marteau"
        lore="Un fragment de la Voie de l'acier rejoint ton codex."
        action={{ label: 'Ouvrir le codex', onPress: () => setModal(null) }}
        dismissLabel="Fermer"
        onClose={() => setModal(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface.page,
  },
  content: {
    padding: spacing.screen,
    // Un catalogue a besoin de plus d'air qu'un écran : c'est le seul grand
    // cran du thème, détourné de son usage d'origine.
    gap: spacing.notch,
  },
  masthead: {
    gap: spacing.row,
  },
  section: {
    gap: spacing.block,
  },
  variant: {
    gap: spacing.row,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.block,
  },
  loreAccent: {
    color: colors.text.lore,
  },
  reorderRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: gap.row,
    paddingHorizontal: padding.dense.x,
    backgroundColor: colors.surface.raised,
    borderWidth: border.hairline,
    borderColor: colors.line.default,
  },
});
