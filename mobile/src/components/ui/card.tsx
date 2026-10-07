import React from 'react';
import { View, Text, type ViewProps, type TextProps } from 'react-native';
import { cn } from '../../lib/utils';

export function Card({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn('bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ViewProps) {
  return <View className={cn('flex-col gap-1 pb-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: TextProps) {
  return (
    <Text
      className={cn('text-base font-semibold text-zinc-100 tracking-tight', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: TextProps) {
  return (
    <Text className={cn('text-xs text-zinc-400 font-normal leading-relaxed', className)} {...props} />
  );
}

export function CardContent({ className, ...props }: ViewProps) {
  return <View className={cn('pt-1', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ViewProps) {
  return <View className={cn('flex-row items-center pt-3 border-t border-zinc-800/80', className)} {...props} />;
}
