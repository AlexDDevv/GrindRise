import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BeatModal } from '../components/BeatModal';
import {
  mainTrack,
  sportTracks,
  type NarrativeTrack,
  type UnlockedBeat,
} from '../narrativeState';
import { useCodex } from '../useCodex';

/** Les deux axes de contenu du plan narratif, et rien d'autre. */
type Section = 'histoire' | 'voies';

/**
 * Codex narratif : ce que le joueur a débloqué.
 *
 * Deux sections, qui reprennent exactement les deux axes du plan :
 * « Histoire » pour la trame principale (pilotée par le niveau global), et
 * « Voies » pour les trames annexes (une par sport pratiqué, ouverte par les
 * séances loggées dans ce sport). La classe du joueur n'apparaît nulle part
 * dans cet écran — elle donne le ton du texte, pas l'accès.
 *
 * Structure seulement : le contenu réel arrivera en base, et la direction
 * artistique se décide en phase 3.
 */
export function CodexScreen() {
  const { state, source, error, reload, sportNames, presented, openBeat, closeBeat } =
    useCodex();
  const [section, setSection] = useState<Section>('histoire');

  if (!state) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const principale = mainTrack(state);
  const voies = sportTracks(state);

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <SectionTab
          label="Histoire"
          isActive={section === 'histoire'}
          onPress={() => setSection('histoire')}
        />
        <SectionTab
          label="Voies"
          isActive={section === 'voies'}
          onPress={() => setSection('voies')}
        />
      </View>

      {source === 'fixtures' ? (
        <Text style={styles.banner}>
          Données factices : aucun fragment n’est encore écrit en base.
          {error ? ` (${error})` : ''}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        {section === 'histoire' ? (
          <TrackSection
            title="Trame principale"
            subtitle={`Niveau ${state.level}`}
            track={principale}
            emptyLabel="Rien de débloqué pour l’instant. Monte de niveau."
            onOpenBeat={openBeat}
          />
        ) : voies.length === 0 ? (
          <Text style={styles.empty}>
            Aucune voie ouverte. Logge une séance dans un sport pour commencer la
            sienne.
          </Text>
        ) : (
          voies.map((voie) => (
            <TrackSection
              key={voie.track}
              title={
                voie.sportId ? (sportNames[voie.sportId] ?? voie.sportId) : voie.track
              }
              subtitle={`${voie.sessions ?? 0} séance${(voie.sessions ?? 0) > 1 ? 's' : ''}`}
              track={voie}
              emptyLabel="Voie commencée. Le premier fragment n’est pas encore atteint."
              onOpenBeat={openBeat}
            />
          ))
        )}

        <Pressable onPress={() => void reload()} accessibilityRole="button">
          <Text style={styles.refresh}>Actualiser</Text>
        </Pressable>
      </ScrollView>

      <BeatModal beat={presented} onClose={closeBeat} />
    </View>
  );
}

function SectionTab({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, isActive && styles.tabActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
    >
      <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function TrackSection({
  title,
  subtitle,
  track,
  emptyLabel,
  onOpenBeat,
}: {
  title: string;
  subtitle: string;
  track: NarrativeTrack | null;
  emptyLabel: string;
  onOpenBeat: (beat: UnlockedBeat) => void;
}) {
  const beats = track?.beats ?? [];

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>

      {beats.length === 0 ? (
        <Text style={styles.empty}>{emptyLabel}</Text>
      ) : (
        beats.map((beat) => (
          <BeatRow key={beat.id} beat={beat} onPress={() => onOpenBeat(beat)} />
        ))
      )}
    </View>
  );
}

function BeatRow({ beat, onPress }: { beat: UnlockedBeat; onPress: () => void }) {
  const isUnread = beat.read_at === null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.beat, pressed && styles.beatPressed]}
    >
      <View style={styles.beatText}>
        <Text style={[styles.beatTitle, isUnread && styles.beatTitleUnread]}>
          {beat.title}
        </Text>
        <Text style={styles.beatMeta}>
          {beat.trigger_type === 'global_level'
            ? `Niveau ${beat.trigger_value}`
            : `${beat.trigger_value} séance${beat.trigger_value > 1 ? 's' : ''}`}
        </Text>
      </View>

      {/* Une pastille, pas un libellé : le fragment non lu a déjà été présenté
          en modale, ce point ne fait que rappeler où il est. */}
      {isUnread ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  tabActive: {
    borderColor: '#1c1c1e',
    backgroundColor: '#1c1c1e',
  },
  tabLabel: {
    fontSize: 15,
    color: '#333',
  },
  tabLabelActive: {
    color: '#fff',
    fontWeight: '600',
  },
  banner: {
    fontSize: 13,
    color: '#8a6d00',
    backgroundColor: '#fff8e1',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  content: {
    gap: 24,
    padding: 20,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#888',
  },
  empty: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  beat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  beatPressed: {
    opacity: 0.6,
  },
  beatText: {
    flex: 1,
    gap: 2,
  },
  beatTitle: {
    fontSize: 16,
    color: '#333',
  },
  beatTitleUnread: {
    fontWeight: '700',
    color: '#1c1c1e',
  },
  beatMeta: {
    fontSize: 13,
    color: '#888',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1c1c1e',
  },
  refresh: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingVertical: 8,
  },
});
