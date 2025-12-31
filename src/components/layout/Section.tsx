import { HTMLAttributes, ReactNode } from 'react';

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Section({
  children,
  className = '',
  padding = 'md',
  ...props
}: SectionProps) {
  const paddings = {
    none: '',
    sm: 'py-4',
    md: 'py-8',
    lg: 'py-12',
  };

  return (
    <section className={`${paddings[padding]} ${className}`} {...props}>
      {children}
    </section>
  );
}
