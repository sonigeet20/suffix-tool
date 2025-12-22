import { HTMLAttributes, ReactNode } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export function Badge({
  children,
  className = '',
  variant = 'default',
  size = 'md',
  ...props
}: BadgeProps) {
  const baseStyles =
    'inline-flex items-center gap-1 font-medium rounded-md transition-colors';

  const variants = {
    default:
      'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
    primary:
      'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-400',
    success:
      'bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-400',
    warning:
      'bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-400',
    danger:
      'bg-error-100 text-error-700 dark:bg-error-500/20 dark:text-error-400',
    outline:
      'border border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300',
  };

  const sizes = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-0.5 text-xs',
    lg: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
