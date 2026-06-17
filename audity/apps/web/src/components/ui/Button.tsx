import { ButtonHTMLAttributes, ReactNode, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "audity-btn-primary",
  secondary: "audity-btn-secondary",
  ghost:
    "h-8 rounded-audity px-3 text-sm text-audity-secondary hover:bg-audity-panelAlt hover:text-audity-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-audity-primary disabled:cursor-not-allowed disabled:opacity-60",
  danger:
    "h-8 rounded-audity bg-audity-error px-3 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-audity-error disabled:cursor-not-allowed disabled:opacity-60"
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-7 px-2 text-xs",
  md: ""
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    isLoading,
    leftIcon,
    rightIcon,
    fullWidth,
    disabled,
    className = "",
    children,
    type = "button",
    ...rest
  },
  ref
) {
  const classes = [
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    fullWidth ? "w-full" : "",
    "inline-flex items-center justify-center gap-1.5",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      aria-disabled={disabled || isLoading || undefined}
      aria-busy={isLoading || undefined}
      className={classes}
      {...rest}
    >
      {isLoading ? (
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : leftIcon ? (
        <span className="shrink-0" aria-hidden="true">{leftIcon}</span>
      ) : null}
      <span className="min-w-0 truncate">{children}</span>
      {!isLoading && rightIcon ? <span className="shrink-0" aria-hidden="true">{rightIcon}</span> : null}
    </button>
  );
});
