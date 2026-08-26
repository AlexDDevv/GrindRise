import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

import { border, colors, reorder, shadow } from '../../theme';

/**
 * Liste réordonnable par glisser, sans dépendance native.
 *
 * `PanResponder` et `Animated` viennent du cœur de React Native : rien à
 * installer, rien à reconstruire, Expo Go continue de fonctionner. Le geste
 * tourne en thread JS, ce qui serait un mauvais choix pour une liste longue ou
 * un écran chargé — ici la liste est plafonnée à 30 lignes et l'écran ne fait
 * rien d'autre pendant le glisser.
 *
 * **Un seul responder, au niveau de la liste.** Un responder par ligne devrait
 * être recréé à chaque rendu, et le geste en cours serait perdu dès que la liste
 * se redessine — ce qu'elle fait à chaque franchissement de ligne. Celui-ci est
 * créé une fois et lit des refs mutables.
 *
 * **La hauteur de ligne est uniforme, et c'est la prop qui l'impose.** Elle rend
 * le calcul de la cible trivial (`dy / rowHeight`) ; à hauteur variable il
 * faudrait mesurer chaque ligne et le calcul deviendrait fragile. C'est pour ça
 * que l'appelant replie ses cartes avant d'entrer en réordonnancement.
 */

export type ReorderHandle = {
  /** À poser sur la poignée : c'est elle qui arme le glisser. */
  onPressIn: () => void;
  onPressOut: () => void;
  /** Vrai pour la ligne en cours de déplacement. */
  active: boolean;
};

type Props<T> = {
  data: readonly T[];
  keyOf: (item: T) => string;
  /** Hauteur exacte de chaque ligne, en points. Uniforme, sans exception. */
  rowHeight: number;
  /** Appelé une fois, au relâchement, avec les index de départ et d'arrivée. */
  onMove: (from: number, to: number) => void;
  /**
   * Vrai dès que la poignée est tenue, et jusqu'au relâchement du glisser.
   * C'est ce que l'appelant attend pour suspendre un défilement parent.
   *
   * Tenue et non saisie : entre l'appui et le franchissement du seuil de
   * glisser, un `ScrollView` parent est libre de partir avec le geste, et
   * `onPanResponderTerminationRequest` ne défend que ce qui est déjà accordé.
   * Suspendre dès l'appui ne coûte rien, personne ne défile en tenant une
   * poignée.
   */
  onGrabChange?: (grabbed: boolean) => void;
  renderItem: (item: T, index: number, handle: ReorderHandle) => React.ReactNode;
};

type DragState = { from: number; offset: number };

export function ReorderableList<T>({
  data,
  keyOf,
  rowHeight,
  onMove,
  onGrabChange,
  renderItem,
}: Props<T>) {
  const [drag, setDrag] = useState<DragState | null>(null);

  // Refs et non state : le responder est créé une fois et doit lire les valeurs
  // courantes, pas celles capturées à sa création.
  const armed = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const grabbedRef = useRef(false);
  const lengthRef = useRef(data.length);
  const onMoveRef = useRef(onMove);
  const onGrabChangeRef = useRef(onGrabChange);

  lengthRef.current = data.length;
  onMoveRef.current = onMove;
  onGrabChangeRef.current = onGrabChange;

  const translateY = useRef(new Animated.Value(0)).current;

  /**
   * Le seul endroit d'où l'appelant est prévenu.
   *
   * Deux sources pour un même fait, la poignée tenue et le glisser en cours :
   * annoncer depuis chacune enverrait deux fois la même chose, l'armement étant
   * toujours acquis quand le glisser démarre. Seules les transitions partent,
   * si bien que les `onPanResponderMove` répétés restent muets.
   */
  const announceGrab = () => {
    const grabbed = armed.current !== null || dragRef.current !== null;
    if (grabbed === grabbedRef.current) return;

    grabbedRef.current = grabbed;
    onGrabChangeRef.current?.(grabbed);
  };

  /**
   * Le passage unique par où l'armement de la poignée change, les trois
   * désarmements compris : une ref ne prévient personne quand on l'écrit,
   * l'annonce part donc d'ici.
   */
  const setArmed = (next: number | null) => {
    armed.current = next;
    announceGrab();
  };

  /**
   * Le passage unique par où l'état de glisser change : la relâche comme la
   * terminaison y aboutissent. La troisième sortie, le démontage en plein
   * geste, ne passe par personne — c'est le nettoyage de l'effet qui la
   * rattrape.
   */
  const setDragState = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
    announceGrab();
  };

  // Démontée alors que la poignée est encore tenue, quand l'appelant quitte le
  // mode réordonnancement d'un second doigt, la liste ne verra ni relâche ni
  // terminaison : sans ce filet, elle laisserait le défilement suspendu.
  useEffect(
    () => () => {
      if (grabbedRef.current) onGrabChangeRef.current?.(false);
    },
    [],
  );

  /**
   * Le décalage retombe à zéro APRÈS le commit, jamais pendant le geste.
   *
   * `translateY.setValue` écrit droit sur la vue native, hors du cycle de
   * rendu. Appelée au relâchement, elle s'appliquait donc avant que React
   * n'ait commité la liste réordonnée : la ligne saisie claquait à son ancien
   * emplacement le temps d'une frame, puis ressautait au nouveau. Un effet de
   * disposition tombe dans le même commit que le nouvel ordre, et avant
   * l'affichage — les deux mouvements n'en font plus qu'un.
   *
   * Il dépend de `drag` et non de `data` : relâcher sans avoir changé l'ordre
   * ne touche pas aux données, et le décalage resterait à l'écran.
   */
  useLayoutEffect(() => {
    if (drag === null) translateY.setValue(0);
  }, [drag, translateY]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Capture plutôt que bubbling : la poignée est un `Pressable`, et sans
        // capture c'est elle qui garderait le geste.
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          armed.current !== null && Math.abs(gesture.dy) > reorder.dragThreshold,

        // Le geste ne se rend pas. Le défaut accepte la terminaison : un
        // `ScrollView` parent qui reconnaît un défilement vertical réclame le
        // geste, et `onPanResponderTerminate` remettrait alors la ligne à sa
        // place au milieu du glisser, sans que rien ne soit déplacé.
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: () => {
          if (armed.current === null) return;
          translateY.setValue(0);
          setDragState({ from: armed.current, offset: 0 });
        },

        onPanResponderMove: (_event, gesture) => {
          const current = dragRef.current;
          if (current === null) return;

          translateY.setValue(gesture.dy);

          // Borné pour que la cible reste dans la liste : sans ça, relâcher
          // au-delà du dernier élément demanderait un index inexistant.
          const raw = Math.round(gesture.dy / rowHeight);
          const max = lengthRef.current - 1 - current.from;
          const min = -current.from;
          const offset = Math.min(max, Math.max(min, raw));

          if (offset !== current.offset) setDragState({ ...current, offset });
        },

        onPanResponderRelease: () => {
          const current = dragRef.current;
          setArmed(null);

          if (current !== null && current.offset !== 0) {
            onMoveRef.current(current.from, current.from + current.offset);
          }

          setDragState(null);
        },

        // Un geste interrompu (appel entrant, notification) ne doit pas laisser
        // une ligne décalée à l'écran.
        onPanResponderTerminate: () => {
          setArmed(null);
          setDragState(null);
        },
      }),
    [rowHeight, translateY],
  );

  return (
    <View {...responder.panHandlers}>
      {data.map((item, index) => {
        const active = drag?.from === index;
        const handle: ReorderHandle = {
          onPressIn: () => {
            setArmed(index);
          },
          onPressOut: () => {
            // Relâché sans avoir bougé : désarmer, sinon un simple appui sur la
            // poignée armerait le glisser jusqu'au geste suivant.
            if (dragRef.current === null) setArmed(null);
          },
          active,
        };

        return (
          <Animated.View
            key={keyOf(item)}
            style={[
              { height: rowHeight },
              active ? styles.dragged : null,
              { transform: [{ translateY: active ? translateY : shiftOf(index, drag, rowHeight) }] },
            ]}
          >
            {renderItem(item, index, handle)}
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * De combien une ligne non saisie s'écarte pour laisser la place.
 *
 * Les lignes situées entre le départ et la cible reculent d'une hauteur, dans
 * le sens opposé au déplacement. Les autres ne bougent pas.
 */
function shiftOf(index: number, drag: DragState | null, rowHeight: number): number {
  if (drag === null || drag.offset === 0) return 0;

  const target = drag.from + drag.offset;

  if (drag.from < index && index <= target) return -rowHeight;
  if (target <= index && index < drag.from) return rowHeight;

  return 0;
}

const styles = StyleSheet.create({
  dragged: {
    // La ligne quitte le plan de la liste : ombre portée et filet à l'or, ce
    // que la maquette ⑦ décrit exactement.
    boxShadow: [shadow.dragged],
    borderWidth: border.hairline,
    borderColor: colors.accent.gold,
    zIndex: 1,
  },
});
