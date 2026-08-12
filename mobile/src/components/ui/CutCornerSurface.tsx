import { useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Polygon, Svg } from 'react-native-svg';

/**
 * Coin coupé — `Direction artistique.dc.html` §04.
 *
 * Biseau en haut à gauche et en bas à droite, réservé aux boutons pleins. Le
 * DA l'écrit en `clip-path` ; faute d'équivalent React Native, la forme est
 * tracée en SVG. La longueur du biseau est absolue, elle ne se met pas à
 * l'échelle : le tracé attend donc la mesure réelle de la surface, et un
 * rectangle plein tient la place le temps du premier passage de layout.
 */

type Props = {
  /** Longueur du biseau. Voir `cutCorner` dans le thème. */
  cut: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function CutCornerSurface({ cut, color, style, children }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (size?.width !== width || size?.height !== height) {
      setSize({ width, height });
    }
  };

  const points = size
    ? [
        `${cut},0`,
        `${size.width},0`,
        `${size.width},${size.height - cut}`,
        `${size.width - cut},${size.height}`,
        `0,${size.height}`,
        `0,${cut}`,
      ].join(' ')
    : null;

  return (
    <View
      onLayout={handleLayout}
      style={[styles.surface, size ? null : { backgroundColor: color }, style]}
    >
      {size ? (
        <Svg
          width={size.width}
          height={size.height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Polygon points={points ?? ''} fill={color} />
        </Svg>
      ) : null}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
