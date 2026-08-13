import { Ionicons } from '@expo/vector-icons';

import { Hexagon } from '../../components/ui';
import {
  colors,
  gradient,
  medallionSize,
  type MedallionSize,
} from '../../theme';

/**
 * Emblème d'un sport : son icône, gravée dans l'hexagone du §04.
 *
 * `sports.icon` porte un nom de glyphe Ionicons (`barbell`, `walk`, `water`,
 * `bicycle`), rempli par la migration de données de référence. C'est une colonne
 * `text` : rien en base ne garantit que la valeur désigne un glyphe existant, et
 * un nom inconnu ferait afficher un carré vide par la librairie. La table de
 * glyphes est donc consultée avant de la passer.
 *
 * `selected` reprend la construction du médaillon de niveau — cadre doré en
 * dégradé, cœur sombre imbriqué — plutôt qu'un aplat d'or : le §04 interdit de
 * combiner bordure et découpe, et le cadre est la façon dont le DA distingue un
 * hexagone actif. Un aplat, lui, appartient aux actions.
 *
 * Les illustrations définitives des sports font partie de ce que le §07 laisse à
 * produire ; l'icône tient la place en attendant, dans la bonne forme.
 */

type Props = {
  /** `sports.icon`, potentiellement nul ou inconnu. */
  icon: string | null;
  /** Taille de l'hexagone, sur l'échelle des médaillons. */
  size?: Extract<MedallionSize, 's' | 'm'>;
  selected?: boolean;
};

type GlyphName = keyof typeof Ionicons.glyphMap;

function isGlyph(name: string | null): name is GlyphName {
  return name !== null && name in Ionicons.glyphMap;
}

export function SportEmblem({ icon, size = 's', selected = false }: Props) {
  const box = medallionSize[size];

  return (
    <Hexagon
      width={box.width}
      fill={selected ? gradient.medallionFrame : colors.workoutCard.glyphBackground}
      inner={
        selected && box.inner ? { ...box.inner, color: colors.medallion.core } : null
      }
    >
      <Ionicons
        // Repli sur une pastille neutre plutôt qu'un carré vide : un sport
        // ajouté en base sans icône reste choisissable.
        name={isGlyph(icon) ? icon : 'ellipse'}
        size={Math.round(box.width / 2)}
        color={selected ? colors.accent.goldLight : colors.workoutCard.glyph}
      />
    </Hexagon>
  );
}
