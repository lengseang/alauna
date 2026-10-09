import React, { forwardRef, useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { hit, makeStyles, useTheme } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  /** Always visible above the input (a placeholder is not a label). */
  label: string;
  hint?: string;
  /** Shown below the input in the danger color; say what to do, not just what went wrong. */
  error?: string;
}

/** Labeled text input: square, >= 48dp, visible 3:1 boundary, accent edge on focus, error under the field. */
export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, hint, error, multiline, onFocus, onBlur, ...rest }, ref) {
  const { colors, type } = useTheme();
  const s = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.wrap}>
      <Text variant="label">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        multiline={multiline}
        maxFontSizeMultiplier={1.6}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[s.input, type.body, { color: colors.text }, multiline && s.multi, focused && s.focused, !!error && s.error]}
      />
      {error ? (
        <Text variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small">{hint}</Text>
      ) : null}
    </View>
  );
});

export interface SearchFieldProps extends Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (text: string) => void;
  /** Spoken name, e.g. "Search models". Also the placeholder unless one is given. */
  label: string;
}

/** Square search bar: glyph, input, clear (x) when there is text. 48dp. Sits under a screen header or in a sheet. */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField({ value, onChangeText, label, placeholder, ...rest }, ref) {
  const { colors, type } = useTheme();
  const s = useStyles();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[s.search, focused && s.searchFocused]}>
      <Icon name="search" color={colors.muted} />
      <TextInput
        ref={ref}
        accessibilityRole="search"
        accessibilityLabel={label}
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        returnKeyType="search"
        autoCorrect={false}
        maxFontSizeMultiplier={1.6}
        {...rest}
        value={value}
        onChangeText={onChangeText}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[s.searchInput, type.body, { color: colors.text }]}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => onChangeText('')} style={s.clear}>
          <Icon name="close" color={colors.muted} size={20} />
        </Pressable>
      ) : null}
    </View>
  );
});

const useStyles = makeStyles(({ colors, space, line }) => ({
  wrap: { gap: space.xs },
  input: { minHeight: hit, borderWidth: line, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: space.lg, paddingVertical: space.sm },
  multi: { minHeight: 96, textAlignVertical: 'top', paddingTop: space.md },
  focused: { borderColor: colors.accent, borderLeftWidth: 3, paddingLeft: space.lg - 2 },
  error: { borderColor: colors.danger },
  search: { minHeight: hit, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.md, borderWidth: line, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  searchFocused: { borderColor: colors.accent },
  searchInput: { flex: 1, minHeight: hit - 2, paddingVertical: space.sm },
  clear: { minWidth: hit, minHeight: hit, width: hit, height: hit, alignItems: 'center', justifyContent: 'center' },
}));
