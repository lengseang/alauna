import React, { useRef, useState } from 'react';
import { PanResponder, View, type AccessibilityActionEvent } from 'react-native';
import { hit, makeStyles } from '../theme';
import { snapValue, toFraction } from './logic';
import { Text } from './Text';

export interface SliderProps {
  label: string;
  value: number;
  /** Fires on every step change while dragging (live preview). */
  onChange: (value: number) => void;
  /** Fires once on release / accessibility step (persist here). */
  onCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Bipolar scales (PAD -1..1): the fill grows from this value instead of from `min`, and it gets a tick. */
  origin?: number;
  /** Shown value text (also spoken). Default: the number with the step's decimals. */
  format?: (value: number) => string;
  /** Pole names under the track, e.g. ["Calm", "Energetic"]. */
  poles?: [string, string];
  hint?: string;
  disabled?: boolean;
}

const THUMB = 14;

/**
 * Hairline track, accent fill, a lozenge thumb. Tap to jump, drag to slide (a vertical drag hands over to the page
 * scroll), live value on the right in tabular figures. Screen readers get an adjustable control with +/- one step.
 */
export function Slider({ label, value, onChange, onCommit, min = 0, max = 1, step = 0.05, origin, format, poles, hint, disabled }: SliderProps) {
  const s = useStyles();
  const [width, setWidth] = useState(0);
  const st = useRef({ x0: 0, dragging: false, last: value }).current;
  const props = useRef({ onChange, onCommit, min, max, step, width, disabled });
  props.current = { onChange, onCommit, min, max, step, width, disabled };
  st.last = value;

  const fmt = format ?? ((v: number) => v.toFixed(Math.max(0, (String(step).split('.')[1] ?? '').length)));
  const at = (x: number) => {
    const p = props.current;
    return snapValue(p.min + (Math.max(0, Math.min(p.width, x)) / Math.max(1, p.width)) * (p.max - p.min), p.min, p.max, p.step);
  };
  const emit = (v: number) => {
    if (v !== st.last) {
      st.last = v;
      props.current.onChange(v);
    }
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !props.current.disabled,
      onPanResponderGrant: (e) => {
        st.x0 = e.nativeEvent.locationX;
        st.dragging = false;
      },
      onPanResponderMove: (_, g) => {
        if (!st.dragging && Math.abs(g.dx) > 4 && Math.abs(g.dx) > Math.abs(g.dy)) st.dragging = true;
        if (st.dragging) emit(at(st.x0 + g.dx));
      },
      // Until the drag is clearly horizontal, the page may take the gesture (scrolling a long settings list).
      onPanResponderTerminationRequest: () => !st.dragging,
      onPanResponderRelease: (_, g) => {
        if (!st.dragging && Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) emit(at(st.x0)); // a tap jumps
        st.dragging = false;
        props.current.onCommit?.(st.last);
      },
      onPanResponderTerminate: () => {
        st.dragging = false;
      },
    }),
  ).current;

  const onA11y = (e: AccessibilityActionEvent) => {
    const dir = e.nativeEvent.actionName === 'increment' ? 1 : e.nativeEvent.actionName === 'decrement' ? -1 : 0;
    if (!dir || disabled) return;
    const v = snapValue(value + dir * step, min, max, step);
    emit(v);
    onCommit?.(v);
  };

  const f = toFraction(value, min, max);
  const o = origin === undefined ? 0 : toFraction(origin, min, max);
  const lo = Math.min(f, o);
  const text = fmt(value);

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityValue={{ min, max, now: value, text }}
      accessibilityState={{ disabled: !!disabled }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onA11y}
      style={[s.root, disabled && s.disabled]}
    >
      <View style={s.head}>
        <Text variant="label" style={s.flex} numberOfLines={1}>
          {label}
        </Text>
        <Text variant="label" tone="accent" style={s.value}>
          {text}
        </Text>
      </View>
      <View style={s.touch} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...pan.panHandlers}>
        <View pointerEvents="none" style={s.track}>
          {origin !== undefined ? <View style={[s.originTick, { left: `${o * 100}%` }]} /> : null}
          <View style={[s.fill, { left: `${lo * 100}%`, width: `${Math.abs(f - o) * 100}%` }]} />
        </View>
        <View pointerEvents="none" style={[s.thumb, { left: f * width - THUMB / 2 }]} />
      </View>
      {poles ? (
        <View style={s.poles}>
          <Text variant="small">{poles[0]}</Text>
          <Text variant="small">{poles[1]}</Text>
        </View>
      ) : null}
      {hint ? <Text variant="small">{hint}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors, space }) => ({
  root: { gap: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
  value: { fontVariant: ['tabular-nums'] },
  touch: { height: hit, justifyContent: 'center', marginHorizontal: THUMB / 2 },
  track: { height: 2, backgroundColor: colors.borderStrong },
  fill: { position: 'absolute', top: 0, height: 2, backgroundColor: colors.accent },
  originTick: { position: 'absolute', top: -5, width: 1, height: 12, marginLeft: -0.5, backgroundColor: colors.muted },
  thumb: { position: 'absolute', top: hit / 2 - THUMB / 2, width: THUMB, height: THUMB, backgroundColor: colors.accent, transform: [{ rotate: '45deg' }] },
  poles: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -space.sm },
  disabled: { opacity: 0.45 },
}));
