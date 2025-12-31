import { HTMLAttributes, ReactNode } from 'react';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function Panel({
  children,
  className = '',
  title,
  description,
  action,
  ...props
}: PanelProps) {
  return (
    <div
      className={`bg-white dark:bg-dark-surface rounded-xl border border-neutral-200 dark:border-dark-border shadow-sm ${className}`}
      {...props}
    >
      {(title || description || action) && (
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-dark-border">
          <div className="flex items-start justify-between gap-4">
            <div>
              {title && (
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-dark-text-primary">
                  {title}
                </h3>
              )}
              {description && (
                <p className="mt-1 text-sm text-neutral-600 dark:text-dark-text-secondary">
                  {description}
                </p>
              )}
            </div>
            {action && <div className="flex-shrink-0">{action}</div>}
          </div>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
