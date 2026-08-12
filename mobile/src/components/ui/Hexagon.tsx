import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Defs, LinearGradient, Polygon, Stop, Svg } from 'react-native-svg';

import { heightOf, hexagon } from '../../theme';
import { useSvgId } from './useSvgId';

/**
 * Hexagone gravé — `Direction artistique.dc.html` §04.
 *
 * Le DA le décrit en `clip-path`, que React Native n'a pas : la forme est donc
 * tracée en SVG à partir des mêmes fractions de boîte. Le cadre doré n'est pas
 * une bordure mais un second hexagone imbriqué, comme l'impose le DA
 * (« jamais de bordure + clip-path combinés »).
 *
 * Seule la largeur est demandée : la hauteur découle du ratio du DA.
 */

type Fill =
  | string
  | {
      readonly colors: readonly [string, string];
      readonly start: { readonly x: number; readonly y: number };
      readonly end: { readonly x: number; readonly y: number };
    };

type Props = {
  width: number;
  /** Remplissage du contour : une couleur pleine ou un dégradé du thème. */
  fill: Fill;
  /** Cœur imbriqué. Omis, l'hexagone est plein. */
  inner?: { width: number; height: number; color: string } | null;
  /** Contenu centré au-dessus de la forme : chiffre gravé, losange, icône. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Place les six sommets du DA dans une boîte, centrée dans le tracé complet. */
function pointsFor(boxWidth: number, boxHeight: number, outerWidth: number, outerHeight: number) {
  const offsetX = (outerWidth - boxWidth) / 2;
  const offsetY = (outerHeight - boxHeight) / 2;

  return hexagon.points
    .map(([fx, fy]) => `${offsetX + fx * boxWidth},${offsetY + fy * boxHeight}`)
    .join(' ');
}

export function Hexagon({ width, fill, inner, children, style }: Props) {
  const gradientId = useSvgId('hex');
  const height = heightOf(width);
  const isGradient = typeof fill !== 'string';

  return (
    <View style={[{ width, height }, styles.box, style]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {isGradient ? (
          <Defs>
            <LinearGradient
              id={gradientId}
              x1={fill.start.x}
              y1={fill.start.y}
              x2={fill.end.x}
              y2={fill.end.y}
            >
              <Stop offset="0" stopColor={fill.colors[0]} />
              <Stop offset="1" stopColor={fill.colors[1]} />
            </LinearGradient>
          </Defs>
        ) : null}

        <Polygon
          points={pointsFor(width, height, width, height)}
          fill={isGradient ? `url(#${gradientId})` : fill}
        />

        {inner ? (
          <Polygon points={pointsFor(inner.width, inner.height, width, height)} fill={inner.color} />
        ) : null}
      </Svg>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
