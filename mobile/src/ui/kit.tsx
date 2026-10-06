import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useToast } from '../services/toast.ts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius } from './theme';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[kit.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={kit.section}>{children}</Text>;
}

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
const TONE_BG: Record<Tone, string> = { neutral: colors.surface3, good: colors.goodSoft, warn: colors.warnSoft, bad: colors.badSoft, accent: colors.accentSoft };
const TONE_FG: Record<Tone, string> = { neutral: colors.muted, good: colors.good, warn: colors.warn, bad: colors.bad, accent: colors.accent };

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <View style={[kit.badge, { backgroundColor: TONE_BG[tone] }]}>
      <Text style={[kit.badgeText, { color: TONE_FG[tone] }]}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ fraction, color = colors.accent }: { fraction: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100;
  return (
    <View style={kit.track}>
      <View style={[kit.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export function Banner({ tone = 'accent', children, action }: { tone?: Tone; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View style={[kit.banner, { backgroundColor: TONE_BG[tone] }]}>
      <Text style={[kit.bannerText, { color: tone === 'neutral' ? colors.muted : TONE_FG[tone] }]}>{children}</Text>
      {action}
    </View>
  );
}

/** Top-of-screen toast. Render once at the app root. */
export function ToastHost() {
  const { text, id } = useToast();
  const insets = useSafeAreaInsets();
  if (!text) return null;
  return (
    <View pointerEvents="none" key={id} style={[kit.toastWrap, { top: insets.top + 8 }]}>
      <View style={kit.toast}>
        <Text style={kit.toastText}>{text}</Text>
      </View>
    </View>
  );
}

export const kit = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  section: { color: colors.faint, fontSize: font.xs, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 18, marginBottom: 8, marginLeft: 2 },
  badge: { borderRadius: radius.sm, paddingVertical: 2, paddingHorizontal: 7 },
  badgeText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  banner: { borderRadius: radius.md, padding: 12, gap: 8 },
  bannerText: { fontSize: font.sm, lineHeight: 18 },
  toastWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 100 },
  toast: { backgroundColor: colors.surface3, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 16, maxWidth: '100%' },
  toastText: { color: colors.text, fontSize: font.sm },
});
