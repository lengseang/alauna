import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackArrowIcon } from '../components/Icons';
import { colors, font } from './theme';

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}

/** Standard screen: status-bar safe, header with a real Back button, content below. */
export function Screen({ title, subtitle, onBack, right, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={onBack} style={styles.back}>
            <BackArrowIcon size={20} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  title: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  subtitle: { color: colors.faint, fontSize: font.xs, marginTop: 1 },
});
