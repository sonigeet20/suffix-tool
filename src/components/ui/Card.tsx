import { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'default' | 'outline' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

export function Card({
  children,
  className = '',
  variant = 'default',
  padding = 'md',
  hover = false,
  ...props
}: CardProps) {
  const baseStyles =
    'bg-white dark:bg-neutral-900 rounded-lg transition-smooth duration-200';

  const variants = {
    default: 'border border-neutral-200 dark:border-neutral-800 shadow-xs dark:shadow-none',
    outline: 'border border-neutral-300 dark:border-neutral-700',
    elevated: 'shadow-sm dark:shadow-none border border-neutral-200 dark:border-neutral-800',
  };

  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-6',
  };

  const hoverStyles = hover
    ? 'hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-md dark:hover:shadow-none cursor-pointer transform hover:scale-[1.01]'
    : '';

  return (
    <div
      className={`${baseStyles} ${variants[variant]} ${paddings[padding]} ${hoverStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardHeader({ children, className = '', ...props }: CardHeaderProps) {
  return (
    <div className={`mb-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'h4';
}

export function CardTitle({
  children,
  className = '',
  as: Tag = 'h3',
  ...props
}: CardTitleProps) {
  return (
    <Tag
      className={`text-base font-semibold text-neutral-900 dark:text-neutral-50 ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}

export interface CardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {
  children: ReactNode;
}

export function CardDescription({
  children,
  className = '',
  ...props
}: CardDescriptionProps) {
  return (
    <p
      className={`text-sm text-neutral-500 dark:text-neutral-400 mt-1 ${className}`}
      {...props}
    >
      {children}
    </p>
  );
}

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardContent({ children, className = '', ...props }: CardContentProps) {
  return (
    <div className={`${className}`} {...props}>
      {children}
    </div>
  );
}

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardFooter({ children, className = '', ...props }: CardFooterProps) {
  return (
    <div
      className={`mt-5 pt-5 border-t border-neutral-200 dark:border-neutral-800 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
