import React from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '../../lib/utils';

export function Input({ className, placeholderTextColor = '#71717a', ...props }: TextInputProps) {
  return (
    <TextInput
      className={cn(
        'w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 font-normal',
        className
      )}
      placeholderTextColor={placeholderTextColor}
      {...props}
    />
  );
}
