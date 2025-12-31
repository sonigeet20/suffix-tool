import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className = '',
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    const baseStyles =
      'w-full px-3 py-2 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 placeholder-neutral-400 dark:placeholder-neutral-500 border border-neutral-300 dark:border-neutral-800 rounded-md text-sm transition-smooth duration-150 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:focus:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed';

    const errorStyles = error
      ? 'border-error-500 focus:ring-error-500 focus:border-error-500'
      : '';

    const leftPadding = leftIcon ? 'pl-9' : '';
    const rightPadding = rightIcon ? 'pr-9' : '';

    const widthStyle = fullWidth ? 'w-full' : '';

    return (
      <div className={`${widthStyle}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`${baseStyles} ${errorStyles} ${leftPadding} ${rightPadding} ${className}`}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-neutral-500">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-error-600 dark:text-error-400">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
