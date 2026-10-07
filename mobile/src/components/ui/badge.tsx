import React from 'react';
import { View, Text, type ViewProps, type TextProps } from 'react-native';
import { cn } from '../../lib/utils';

export interface BadgeProps extends ViewProps {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'sky';
  textClassName?: string;
  children?: React.ReactNode;
}

export function Badge({
  className,
  textClassName,
  variant = 'default',
  children,
  ...props
}: BadgeProps) {
  const variantClasses = {
    default: 'bg-zinc-800 border-zinc-700/60',
    secondary: 'bg-zinc-900 border-zinc-800',
    outline: 'border-zinc-700 bg-transparent',
    destructive: 'bg-red-500/15 border-red-500/30',
    success: 'bg-emerald-500/15 border-emerald-500/30',
    sky: 'bg-sky-500/15 border-sky-500/30',
  }[variant];

  const textClasses = {
    default: 'text-zinc-200',
    secondary: 'text-zinc-400',
    outline: 'text-zinc-300',
    destructive: 'text-red-400',
    success: 'text-emerald-400',
    sky: 'text-sky-400',
  }[variant];

  return (
    <View
      className={cn(
        'flex-row items-center justify-center px-2.5 py-1 rounded-full border',
        variantClasses,
        className
      )}
      {...props}
    >
      {typeof children === 'string' ? (
        <Text className={cn('text-xs font-semibold tracking-wide', textClasses, textClassName)}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
