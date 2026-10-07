import React from 'react';
import { TouchableOpacity, Text, type TouchableOpacityProps, type TextStyle } from 'react-native';
import { cn } from '../../lib/utils';

export interface ButtonProps extends TouchableOpacityProps {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  textClassName?: string;
  children?: React.ReactNode;
}

export function Button({
  className,
  textClassName,
  variant = 'default',
  size = 'default',
  children,
  ...props
}: ButtonProps) {
  const baseClasses = 'flex-row items-center justify-center rounded-xl font-medium';

  const variantClasses = {
    default: 'bg-zinc-800 active:bg-zinc-700 border border-zinc-700/60',
    primary: 'bg-sky-500 active:bg-sky-600',
    secondary: 'bg-zinc-900 active:bg-zinc-800 border border-zinc-800',
    outline: 'border border-zinc-700 bg-transparent active:bg-zinc-800/40',
    ghost: 'bg-transparent active:bg-zinc-800/50',
    destructive: 'bg-red-500/20 active:bg-red-500/30 border border-red-500/40',
  }[variant];

  const sizeClasses = {
    default: 'px-4 py-3 min-h-[44px]',
    sm: 'px-3 py-1.5 min-h-[32px] rounded-lg',
    lg: 'px-6 py-4 min-h-[52px] rounded-2xl',
    icon: 'w-10 h-10 p-0 rounded-xl',
  }[size];

  const textColor = {
    default: 'text-zinc-100 font-semibold text-sm',
    primary: 'text-zinc-950 font-bold text-sm',
    secondary: 'text-zinc-200 font-medium text-sm',
    outline: 'text-zinc-300 font-medium text-sm',
    ghost: 'text-zinc-400 font-medium text-sm',
    destructive: 'text-red-400 font-semibold text-sm',
  }[variant];

  return (
    <TouchableOpacity
      className={cn(baseClasses, variantClasses, sizeClasses, className)}
      activeOpacity={0.75}
      {...props}
    >
      {typeof children === 'string' ? (
        <Text className={cn(textColor, textClassName)}>{children}</Text>
      ) : (
        children
      )}
    </TouchableOpacity>
  );
}
