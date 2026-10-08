import React, { forwardRef, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { hit, makeStyles, useTheme } from '../theme';
import { Text } from './Text';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  /** Always visible above the input (a placeholder is not a label). */
  label: string;
  hint?: string;
  /** Shown below the input in the danger color; say what to do, not just what went wrong. */
  error?: string;
}

/** Labeled text input, >= 48dp, visible boundary (3:1), accent border on focus. */
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
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small">{hint}</Text>
      ) : null}
    </View>
  );
});

const useStyles = makeStyles(({ colors, space, radius }) => ({
  wrap: { gap: space.xs },
  input: { minHeight: hit, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, paddingHorizontal: space.lg, paddingVertical: space.sm },
  multi: { minHeight: 96, textAlignVertical: 'top', paddingTop: space.md },
  focused: { borderColor: colors.accent, borderWidth: 2, paddingHorizontal: space.lg - 1 },
  error: { borderColor: colors.danger },
}));
