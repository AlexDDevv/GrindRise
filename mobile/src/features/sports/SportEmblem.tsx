import { Ionicons } from '@expo/vector-icons';

import { colors, medallionSize, type MedallionSize } from '../../theme';
import { Hexagon } from '../../components/ui';

/**
 * Emblème d'un sport : son icône, gravée dans l'hexagone du §04.
 *
 * `sports.icon` porte un nom de glyphe Ionicons (`barbell`, `walk`, `water`,
 * `bicycle`), rempli par la migration de données de référence. C'est une colonne
 * `text` : rien en base ne garantit que la valeur désigne un glyphe existant, et
 * un nom inconnu ferait afficher un carré vide par la librairie. La table de
 * glyphes est donc consultée avant de la passer.
 *
 * Les illustrations définitives des sports font partie de ce que le §07 du DA
 * laisse à produire ; l'icône tient la place en attendant, dans la bonne forme
 * et à la bonne couleur.
 */

type Props = {
  /** `sports.icon`, potentiellement nul ou inconnu. */
  icon: string | null;
  /** Taille de l'hexagone, sur l'échelle des médaillons. */
  size?: Extract<MedallionSize, 's' | 'm'>;
};

type GlyphName = keyof typeof Ionicons.glyphMap;

function isGlyph(name: string | null): name is GlyphName {
  return name !== null && name in Ionicons.glyphMap;
}

export function SportEmblem({ icon, size = 's' }: Props) {
  const box = medallionSize[size];

  return (
    <Hexagon width={box.width} fill={colors.workoutCard.glyphBackground}>
      <Ionicons
        // Repli sur une pastille neutre plutôt qu'un carré vide : un sport
        // ajouté en base sans icône reste choisissable.
        name={isGlyph(icon) ? icon : 'ellipse'}
        size={Math.round(box.width / 2)}
        color={colors.workoutCard.glyph}
      />
    </Hexagon>
  );
}
