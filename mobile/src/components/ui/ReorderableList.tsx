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

/** Bornes verticales d'une zone visible, en coordonnées de la fenêtre. */
export type EdgeBounds = { top: number; bottom: number };

/**
 * Ce que la liste attend du conteneur défilant pour atteindre ce qui est hors
 * écran — implémenté par `Screen`.
 *
 * Impératif et non déclaratif : le glisser lit et écrit le défilement image par
 * image, et passer par un état React ferait rendre l'écran entier à chaque
 * frame.
 */
export type EdgeScroller = {
  /** Où commence et où finit la zone visible, à l'instant de la saisie. */
  measure: (onDone: (bounds: EdgeBounds) => void) => void;
  /**
   * Défile de `dy` points et rend le déplacement **réellement** obtenu, nul en
   * bout de course. La liste s'en sert pour deux choses : suivre le contenu
   * sous le doigt, et savoir quand cesser d'insister.
   */
  scrollBy: (dy: number) => number;
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
  /**
   * Conteneur défilant à piloter quand le doigt atteint un bord. Sans lui, le
   * glisser reste borné à ce qui est déjà à l'écran.
   *
   * Une ref et non la valeur : l'appelant la tient dès son premier rendu, alors
   * que le conteneur ne se sera monté qu'après.
   */
  scroller?: React.RefObject<EdgeScroller | null>;
  renderItem: (item: T, index: number, handle: ReorderHandle) => React.ReactNode;
};

type DragState = { from: number; offset: number };

export function ReorderableList<T>({
  data,
  keyOf,
  rowHeight,
  onMove,
  onGrabChange,
  scroller,
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

  // L'état du défilement automatique, tenu image par image.
  const dyRef = useRef(0);
  const pageYRef = useRef(0);
  const boundsRef = useRef<EdgeBounds | null>(null);
  /** Cumul de ce que la liste a réellement fait défiler depuis la saisie. */
  const scrolledRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  /**
   * Horodatage de l'image précédente, pour défiler au temps et non au compte.
   * Zéro entre deux passages au bord : la boucle sait ainsi qu'elle redémarre.
   */
  const lastFrameRef = useRef(0);

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
  // terminaison : sans ce filet, elle laisserait le défilement suspendu et une
  // image programmée sur un composant disparu.
  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
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

  const responder = useMemo(() => {
    /**
     * Replace la ligne saisie et recalcule sa cible.
     *
     * Le doigt et le défilement s'additionnent : la ligne se déplace dans le
     * contenu, et ce contenu glisse lui-même sous elle. N'en compter qu'un des
     * deux la ferait dériver hors du doigt dès la première image de
     * défilement.
     */
    const applyDrag = () => {
      const current = dragRef.current;
      if (current === null) return;

      // Borné en points, et non plus seulement en rangs.
      //
      // Le décalage affiché suivait le doigt sans limite pendant que la place
      // visée, elle, était bornée. Aux deux bouts les deux divergent — on tire
      // la première ligne trois hauteurs au-dessus du haut, elle ne peut
      // atterrir qu'à la première place — et le relâchement résorbait cet écart
      // d'un coup : la ligne claquait. Au milieu de la liste ça ne se voyait
      // pas, la cible y suivant toujours le doigt.
      const top = -current.from * rowHeight;
      const bottom = (lengthRef.current - 1 - current.from) * rowHeight;
      const total = Math.min(bottom, Math.max(top, dyRef.current + scrolledRef.current));

      translateY.setValue(total);

      // Le rang se déduit alors sans autre garde : un décalage déjà tenu entre
      // ces deux bornes ne peut pas désigner une place qui n'existe pas.
      const offset = Math.round(total / rowHeight);

      if (offset !== current.offset) setDragState({ ...current, offset });
    };

    const stopAutoScroll = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      lastFrameRef.current = 0;
    };

    /**
     * Une image de défilement automatique, qui se reprogramme tant qu'elle sert.
     *
     * Elle s'arrête d'elle-même dans trois cas — le geste est fini, le doigt a
     * quitté la bande de bord, la liste est en bout de course. Le prochain
     * mouvement du doigt la relancera si besoin : insister image après image
     * sur un défilement qui ne bouge plus ne ferait que brûler du temps JS,
     * celui-là même dont le glisser a besoin.
     */
    const step = (now: number) => {
      frameRef.current = null;

      const bounds = boundsRef.current;
      const target = scroller?.current;
      const speed =
        dragRef.current === null || bounds === null || !target
          ? 0
          : edgeSpeed(pageYRef.current, bounds);

      if (speed === 0 || !target) {
        lastFrameRef.current = 0;
        return;
      }

      // La première image d'un passage au bord date, elle ne défile pas.
      // L'alternative serait de partir d'une horloge prise au moment du geste,
      // et le moindre écart entre cette horloge et celle des images se paierait
      // en saut de défilement.
      if (lastFrameRef.current !== 0) {
        // Plafonné : une image perdue — un rendu long, l'app remise au premier
        // plan — ferait sinon sauter le défilement de tout le temps écoulé.
        const elapsed = Math.min(MAX_FRAME_SECONDS, (now - lastFrameRef.current) / 1000);
        const moved = target.scrollBy(speed * elapsed);

        if (moved === 0) {
          lastFrameRef.current = 0;
          return;
        }

        scrolledRef.current += moved;
        applyDrag();
      }

      lastFrameRef.current = now;
      frameRef.current = requestAnimationFrame(step);
    };

    return PanResponder.create({
      // Capture plutôt que bubbling : la poignée est un `Pressable`, et sans
      // capture c'est elle qui garderait le geste.
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        armed.current !== null && Math.abs(gesture.dy) > reorder.dragThreshold,

      // Le geste ne se rend pas. Le défaut accepte la terminaison : un
      // `ScrollView` parent qui reconnaît un défilement vertical réclame le
      // geste, et `onPanResponderTerminate` remettrait alors la ligne à sa
      // place au milieu du glisser, sans que rien ne soit déplacé.
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (event) => {
        if (armed.current === null) return;
        translateY.setValue(0);
        dyRef.current = 0;
        scrolledRef.current = 0;
        pageYRef.current = event.nativeEvent.pageY;

        // Mesurée à la saisie et pas au montage : la zone visible dépend du
        // clavier, de l'orientation et du pied d'écran, qui bougent tous entre
        // deux glissers. Le retour est asynchrone, et le glisser n'attend pas
        // — il fonctionne sans défilement automatique jusqu'à ce qu'il arrive.
        boundsRef.current = null;
        scroller?.current?.measure((bounds) => {
          boundsRef.current = bounds;
        });

        setDragState({ from: armed.current, offset: 0 });
      },

      onPanResponderMove: (event, gesture) => {
        if (dragRef.current === null) return;

        dyRef.current = gesture.dy;
        pageYRef.current = event.nativeEvent.pageY;
        applyDrag();

        if (frameRef.current === null) frameRef.current = requestAnimationFrame(step);
      },

      onPanResponderRelease: () => {
        stopAutoScroll();

        const current = dragRef.current;
        setArmed(null);

        if (current !== null && current.offset !== 0) {
          onMoveRef.current(current.from, current.from + current.offset);
        }

        setDragState(null);
      },

      // Un geste interrompu (appel entrant, notification) ne doit pas laisser
      // une ligne décalée à l'écran, ni un défilement qui continue seul.
      onPanResponderTerminate: () => {
        stopAutoScroll();
        setArmed(null);
        setDragState(null);
      },
    });
  }, [rowHeight, scroller, translateY]);

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
          <Row
            key={keyOf(item)}
            active={active}
            settled={drag === null}
            shift={shiftOf(index, drag, rowHeight)}
            rowHeight={rowHeight}
            dragTranslate={translateY}
          >
            {renderItem(item, index, handle)}
          </Row>
        );
      })}
    </View>
  );
}

type RowProps = {
  /** Vrai pour la ligne en cours de déplacement : elle suit le doigt. */
  active: boolean;
  /** Vrai hors glisser : plus personne ne s'écarte. */
  settled: boolean;
  /** Décalage visé pour laisser la place, en points. */
  shift: number;
  rowHeight: number;
  /** Décalage du doigt, partagé par la liste — il ne vaut que pour la ligne saisie. */
  dragTranslate: Animated.Value;
  children: React.ReactNode;
};

/**
 * Une ligne, et le ressort qui l'écarte.
 *
 * Le décalage était posé en style, comme un nombre nu : les lignes se
 * téléportaient d'une hauteur dès que le doigt franchissait un cran. Une valeur
 * animée par ligne les fait glisser — le composant existe pour ça, un `Hook` ne
 * pouvant pas être appelé dans une boucle de rendu.
 */
function Row({ active, settled, shift, rowHeight, dragTranslate, children }: RowProps) {
  const offset = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  /**
   * La levée, et la repose.
   *
   * Sans elle, la ligne saisie était la seule chose immobile de l'écran : elle
   * colle au doigt au point près pendant que tout le reste glisse, et le geste
   * de l'attraper ne se voyait nulle part. La maquette ⑦ dit qu'elle « flotte »
   * — le filet à l'or et l'ombre le disaient à l'arrêt, il manquait l'instant.
   */
  useEffect(() => {
    const animation = Animated.spring(scale, {
      toValue: active ? reorder.liftScale : 1,
      useNativeDriver: true,
      ...reorder.liftSpring,
    });

    animation.start();

    return () => animation.stop();
  }, [active, scale]);

  /**
   * Hors glisser, le décalage retombe à zéro sans animation, et dans le commit
   * du nouvel ordre.
   *
   * Même raison que pour la ligne saisie : les lignes ont déjà changé de place
   * dans les données, et les ramener en ressort rejouerait un mouvement déjà
   * fait — chacune repartirait d'une hauteur qu'elle n'occupe plus.
   */
  useLayoutEffect(() => {
    if (settled) offset.setValue(0);
  }, [settled, offset]);

  useEffect(() => {
    if (settled) return;

    const animation = Animated.spring(offset, {
      toValue: shift,
      useNativeDriver: true,
      ...reorder.shiftSpring,
    });

    animation.start();

    // Le geste redonne une cible avant que la précédente ne soit atteinte :
    // sans cet arrêt, deux ressorts tireraient la même valeur.
    return () => animation.stop();
  }, [shift, settled, offset]);

  return (
    <Animated.View
      style={[
        { height: rowHeight },
        active ? styles.dragged : null,
        // La ligne saisie suit le doigt, les autres leur ressort. Deux valeurs
        // et non une : celle du doigt est écrite au fil du geste, celle du
        // décalage est animée, et les mêler ferait relancer un ressort à chaque
        // image. Le grossissement, lui, vaut pour la ligne saisie seule.
        { transform: [{ translateY: active ? dragTranslate : offset }, { scale }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Au-delà, l'image est tenue pour perdue et ne fait plus avancer le défilement. */
const MAX_FRAME_SECONDS = 0.05;

/**
 * À quelle vitesse défiler, selon la profondeur du doigt dans la bande de bord
 * — négative vers le haut, nulle au milieu de l'écran, en points par seconde.
 *
 * La vitesse croît du seuil de la bande jusqu'au bord : un défilement qui
 * partirait à pleine vitesse dès le seuil serait impossible à doser, et il n'y
 * a aucun moyen de le ralentir une fois lancé sinon en reculant.
 */
function edgeSpeed(pageY: number, bounds: EdgeBounds): number {
  const fromTop = pageY - bounds.top;
  if (fromTop < reorder.edgeBand) return -ramp(reorder.edgeBand - fromTop);

  const fromBottom = bounds.bottom - pageY;
  if (fromBottom < reorder.edgeBand) return ramp(reorder.edgeBand - fromBottom);

  return 0;
}

/** Profondeur dans la bande → points par seconde, plafonné au bord. */
function ramp(depth: number): number {
  const share = Math.min(1, depth / reorder.edgeBand);
  return share * reorder.edgeSpeed;
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
